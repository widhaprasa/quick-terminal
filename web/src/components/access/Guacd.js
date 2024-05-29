import React, {useEffect, useState} from 'react';
import {useSearchParams} from "react-router-dom";
import quickApi from "../../api/quick";
import strings from "../../utils/strings";
import Guacamole from "guacamole-common-js";
import {wsServer} from "../../common/env";
import {exitFull, requestFullScreen} from "../../utils/utils";
import qs from "qs";
import {Affix, Button, Drawer, Dropdown, Menu, message, Modal} from "antd";
import {
    CopyOutlined,
    ExclamationCircleOutlined,
    ExpandOutlined,
    FolderOutlined,
    WindowsOutlined
} from "@ant-design/icons";
import {Base64} from "js-base64";
import Draggable from "react-draggable";
import FileSystem from "../devops/FileSystem";
import GuacdClipboard from "./GuacdClipboard";
import {debounce} from "../../utils/fun";
import './Guacd.css';
import NoMatch from '../NoMatch';

let fixedSize = false;

const STATE_IDLE = 0;
const STATE_CONNECTING = 1;
const STATE_WAITING = 2;
const STATE_CONNECTED = 3;
const STATE_DISCONNECTING = 4;
const STATE_DISCONNECTED = 5;

const Guacd = () => {

    const [searchParams] = useSearchParams();
    const payloadParam = searchParams.get('payload')
    if (payloadParam == null) {
        return (
            <NoMatch/>
        )
    }

    const payloadStr = Base64.decode(payloadParam)
    let payload
    try {
        payload = JSON.parse(payloadStr)
    } catch (error) {
        return (
            <NoMatch/>
        )
    }

    let protocol = payload['protocol']
    if (!protocol) {
        protocol = 'ssh'
        payload['protocol'] = protocol
    }
    const host = payload['host']
    const port = payload['port']
    const assetId = `${protocol}_${host}_${port}`
    const assetName = `${host}:${port}`

    let width = searchParams.get('width');
    let height = searchParams.get('height');

    if (width && height) {
        fixedSize = true;
    } else {
        width = window.innerWidth;
        height = window.innerHeight;
    }

    let [box, setBox] = useState({width, height});
    let [guacd, setGuacd] = useState({});
    let [session, setSession] = useState({});
    let [clipboardText, setClipboardText] = useState('');
    let [fullScreened, setFullScreened] = useState(false);
    let [clipboardVisible, setClipboardVisible] = useState(false);
    let [fileSystemVisible, setFileSystemVisible] = useState(false);

    useEffect(() => {
        document.title = assetName;
        createSession();
    }, [assetId, assetName]);

    const createSession = async () => {
        let session = await quickApi.create(assetId, 'guacd');
        if (!strings.hasText(session['id'])) {
            return;
        }
        setSession(session);
        renderDisplay(session['id'], protocol, width, height);
    }

    const renderDisplay = (sessionId, protocol, width, height) => {
        let tunnel = new Guacamole.WebSocketTunnel(`${wsServer}/quick/${sessionId}/tunnel`);
        let client = new Guacamole.Client(tunnel);

        // Handle clipboard contents received from virtual machine
        client.onclipboard = handleClipboardReceived;

        // Handle client status change events
        client.onstatechange = (state) => {
            onClientStateChange(state, sessionId);
        };

        client.onerror = onError;
        tunnel.onerror = onError;

        // Get display div from document
        const displayEle = document.getElementById("display");

        // Add client to display div
        const element = client.getDisplay().getElement();
        displayEle.appendChild(element);

        let dpi = 96;
        if (protocol === 'telnet') {
            dpi = dpi * 2;
        }

        let params = {
            'width': width,
            'height': height,
            'dpi': dpi,
            'payload': payloadParam
        };

        let paramStr = qs.stringify(params);

        client.connect(paramStr);
        let display = client.getDisplay();
        display.onresize = function (width, height) {
            display.scale(Math.min(
                window.innerHeight / display.getHeight(),
                window.innerWidth / display.getHeight()
            ))
        }

        const sink = new Guacamole.InputSink();
        displayEle.appendChild(sink.getElement());
        sink.focus();

        const keyboard = new Guacamole.Keyboard(sink.getElement());

        keyboard.onkeydown = (keysym) => {
            client.sendKeyEvent(1, keysym);
            if (keysym === 65288) {
                return false;
            }
        };
        keyboard.onkeyup = (keysym) => {
            client.sendKeyEvent(0, keysym);
        };

        const sinkFocus = debounce(() => {
            sink.focus();
        });

        const mouse = new Guacamole.Mouse(element);

        mouse.onmousedown = mouse.onmouseup = function (mouseState) {
            sinkFocus();
            client.sendMouseState(mouseState);
        }

        mouse.onmousemove = function (mouseState) {
            sinkFocus();
            client.getDisplay().showCursor(false);
            mouseState.x = mouseState.x / display.getScale();
            mouseState.y = mouseState.y / display.getScale();
            client.sendMouseState(mouseState);
        };

        const touch = new Guacamole.Mouse.Touchpad(element); // or Guacamole.Touchscreen

        touch.onmousedown = touch.onmousemove = touch.onmouseup = function (state) {
            client.sendMouseState(state);
        };



        setGuacd({
            client,
            sink,
        });
    }

    useEffect(() => {
        let resize = debounce(() => {
            onWindowResize();
        });
        window.addEventListener('resize', resize);
        window.addEventListener('beforeunload', handleUnload);
        window.addEventListener('focus', handleWindowFocus);

        return () => {
            window.removeEventListener('resize', resize);
            window.removeEventListener('beforeunload', handleUnload);
            window.removeEventListener('focus', handleWindowFocus);
        };
    }, [guacd])

    const onWindowResize = () => {
        if (guacd.client && !fixedSize) {
            const display = guacd.client.getDisplay();
            let width = window.innerWidth;
            let height = window.innerHeight;
            setBox({width, height});
            let scale = Math.min(
                height / display.getHeight(),
                width / display.getHeight()
            );
            display.scale(scale);
            guacd.client.sendSize(width, height);
        }
    }

    const handleUnload = (e) => {
        const message = "Do you want to leave?";
        (e || window.event).returnValue = message; //Gecko + IE
        return message;
    }

    const focus = () => {
        console.log(guacd.sink)
        if (guacd.sink) {
            guacd.sink.focus();
        }
    }

    const handleWindowFocus = (e) => {
        if (navigator.clipboard) {
            try {
                navigator.clipboard.readText().then((text) => {
                    sendClipboard({
                        'data': text,
                        'type': 'text/plain'
                    });
                })
            } catch (e) {
                console.error('Failed to copy clipboard', e);
            }
        }
    };

    const handleClipboardReceived = (stream, mimetype) => {
        if (session['copy'] === '0') {
            // message.warn('Copy disabled');
            return
        }

        if (/^text\//.exec(mimetype)) {
            let reader = new Guacamole.StringReader(stream);
            let data = '';
            reader.ontext = function textReceived(text) {
                data += text;
            };
            reader.onend = async () => {
                setClipboardText(data);
                if (navigator.clipboard) {
                    await navigator.clipboard.writeText(data);
                }
                // message.success('The content you selected has been copied to the clipboard and can be viewed in the input box on the right');
            };
        } else {
            let reader = new Guacamole.BlobReader(stream, mimetype);
            reader.onend = () => {
                setClipboardText(reader.getBlob());
            }
        }
    };

    const sendClipboard = (data) => {
        if (!guacd.client) {
            return;
        }
        if (session['paste'] === '0') {
            message.warn('Paste disabled');
            return
        }
        const stream = guacd.client.createClipboardStream(data.type);
        if (typeof data.data === 'string') {
            let writer = new Guacamole.StringWriter(stream);
            writer.sendText(data.data);
            writer.sendEnd();
        } else {
            let writer = new Guacamole.BlobWriter(stream);
            writer.oncomplete = function clipboardSent() {
                writer.sendEnd();
            };
            writer.sendBlob(data.data);
        }

        if (data.data && data.data.length > 0) {
            // message.info('Copied to the remote server');
        }
    }

    const onClientStateChange = (state, sessionId) => {
        const key = 'message';
        switch (state) {
            case STATE_IDLE:
                message.destroy(key);
                message.loading({content: 'Initializing...', duration: 0, key: key});
                break;
            case STATE_CONNECTING:
                message.destroy(key);
                message.loading({content: 'Connecting...', duration: 0, key: key});
                break;
            case STATE_WAITING:
                message.destroy(key);
                message.loading({content: 'Waiting...', duration: 0, key: key});
                break;
            case STATE_CONNECTED:
                Modal.destroyAll();
                message.destroy(key);
                message.success({content: 'Connection success', duration: 3, key: key});
                break;
            case STATE_DISCONNECTING:

                break;
            case STATE_DISCONNECTED:
                message.info({content: 'Connection closed', duration: 3, key: key});
                break;
            default:
                break;
        }
    };

    const sendCombinationKey = (keys) => {
        if (!guacd.client) {
            return;
        }
        for (let i = 0; i < keys.length; i++) {
            guacd.client.sendKeyEvent(1, keys[i]);
        }
        for (let j = 0; j < keys.length; j++) {
            guacd.client.sendKeyEvent(0, keys[j]);
        }
        message.success('Key(s) sent');
    }

    const showMessage = (msg) => {
        message.destroy();
        Modal.confirm({
            title: 'Message',
            icon: <ExclamationCircleOutlined/>,
            content: msg,
            centered: true,
            onOk() {
                window.location.reload();
            },
            onCancel() {
                window.close();
            },
        });
    }

    const onError = (status) => {
        switch (status.code) {
            case 256:
                showMessage('Unsupported access.');
                break;
            case 512:
                showMessage('Remote service error. Check the target device.');
                break;
            case 513:
                showMessage('Server busy.');
                break;
            case 514:
                showMessage('Server connection timeout.');
                break;
            case 515:
                showMessage('Remote service unexpected error.');
                break;
            case 516:
                showMessage('Resource not found.');
                break;
            case 517:
                showMessage('Resource conflict.');
                break;
            case 518:
                showMessage('Resource closed.');
                break;
            case 519:
                showMessage('Remote service not found.');
                break;
            case 520:
                showMessage('Remote service unavailable.');
                break;
            case 521:
                showMessage('Session conflict.');
                break;
            case 522:
                showMessage('Server connection timeout.');
                break;
            case 523:
                showMessage('Session closed.');
                break;
            case 768:
                showMessage('Network unreachable.');
                break;
            case 769:
                showMessage('Server password verification failed.');
                break;
            case 771:
                showMessage('Client banned.');
                break;
            case 776:
                showMessage('Client connection timeout.');
                break;
            case 781:
                showMessage('Client unexpected error.');
                break;
            case 783:
                showMessage('Invalid type.');
                break;
            case 800:
                showMessage('Session not found.');
                break;
            case 801:
                showMessage('Tunnel creation failed. Check the Guacd Service.');
                break;
            case 802:
                showMessage('Force closed by Administrator.');
                break;
            default:
                if (status.message) {
                    // guacd cannot handle Chinese characters, so base64 encoding is performed.
                    showMessage(Base64.decode(status.message));
                } else {
                    showMessage('Unknown error.');
                }

        }
    };

    const fullScreen = () => {
        if (fullScreened) {
            exitFull();
            setFullScreened(false);
        } else {
            requestFullScreen(document.documentElement);
            setFullScreened(true);
        }
        focus();
    }

    const hotKeyMenu = (
        <Menu>
            <Menu.Item key={'alt+tab'}
                       onClick={() => sendCombinationKey(['65513', '65289'])}>Alt + Tab</Menu.Item>
            <Menu.Item key={'ctrl+alt+delete'}
                       onClick={() => sendCombinationKey(['65507', '65513', '65535'])}>Ctrl + Alt + Delete</Menu.Item>
            <Menu.Item key={'ctrl+alt+backspace'}
                       onClick={() => sendCombinationKey(['65507', '65513', '65288'])}>Ctrl + Alt + Backspace</Menu.Item>
            <Menu.Item key={'windows+d'}
                       onClick={() => sendCombinationKey(['65515', '100'])}>Windows + D</Menu.Item>
            <Menu.Item key={'windows+e'}
                       onClick={() => sendCombinationKey(['65515', '101'])}>Windows + E</Menu.Item>
            <Menu.Item key={'windows+r'}
                       onClick={() => sendCombinationKey(['65515', '114'])}>Windows + R</Menu.Item>
            <Menu.Item key={'windows+x'}
                       onClick={() => sendCombinationKey(['65515', '120'])}>Windows + X</Menu.Item>
            <Menu.Item key={'windows'}
                       onClick={() => sendCombinationKey(['65515'])}>Windows</Menu.Item>
        </Menu>
    );

    const renderDraggableButton = (protocol, session) => {

        let count = 1
        const draggable = []

        // if (protocol === 'rdp' && session['fileSystem'] === '1') {
        //     draggable.push(<Draggable>
        //         <Affix style={{position: 'absolute', bottom: count * 50, right: 50}}>
        //             <Button icon={<FolderOutlined/>} type='primary' shape='circle' onClick={() => {
        //                 setFileSystemVisible(true);
        //             }}/>
        //         </Affix>
        //     </Draggable>)
        //     ++count
        // }

        if (session['copy'] === '1' || session['paste'] === '1') {
            draggable.push( <Draggable>
                <Affix style={{position: 'absolute', bottom: count * 50, right: 50}}>
                    <Button icon={<CopyOutlined/>} type='primary' shape='circle' onClick={() => {
                        setClipboardVisible(true);
                    }}/>
                </Affix>
            </Draggable>)
            ++count
        }

        draggable.push(<Draggable>
            <Affix style={{position: 'absolute', bottom: count * 50, right: 50}}>
                <Button icon={<ExpandOutlined/>} type='primary' shape='circle' onClick={() => {
                    fullScreen();
                }}/>
            </Affix>
        </Draggable>)
        ++count

        if (protocol === 'rdp' || protocol === 'vnc') {
            draggable.push(<Draggable>
                <Affix style={{position: 'absolute', bottom: count * 50, right: 50}}>
                    <Dropdown overlay={hotKeyMenu} trigger={['click']} placement="topLeft">
                        <Button icon={<WindowsOutlined/>} type='primary' shape='circle'/>
                    </Dropdown>
                </Affix>
            </Draggable>)
            ++count
        }

        return draggable
    }

    return (
        <div>
            <div className="container" style={{
                width: box.width,
                height: box.height,
                margin: '0 auto',
                backgroundColor: '#1b1b1b'
            }}>
                <div id="display"/>
            </div>

            {renderDraggableButton(protocol, session)}

            <Drawer
                title={'Browse File'}
                placement="right"
                width={window.innerWidth * 0.8}
                closable={true}
                onClose={() => {
                    focus();
                    setFileSystemVisible(false);
                }}
                open={fileSystemVisible}
            >
                <FileSystem
                    storageId={session['id']}
                    storageType={'quick'}
                    upload={session['upload'] === '1'}
                    download={session['download'] === '1'}
                    delete={session['delete'] === '1'}
                    rename={session['rename'] === '1'}
                    edit={session['edit'] === '1'}
                    minHeight={window.innerHeight - 103}/>
            </Drawer>

            <GuacdClipboard
                visible={clipboardVisible}
                clipboardText={clipboardText}
                handleOk={(text) => {
                    sendClipboard({
                        'data': text,
                        'type': 'text/plain'
                    });
                    setClipboardText(text);
                    setClipboardVisible(false);
                    focus();
                }}
                handleCancel={() => {
                    setClipboardVisible(false);
                    focus();
                }}
            />
        </div>
    );
};

export default Guacd;