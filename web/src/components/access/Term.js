import React, {useEffect, useState} from 'react';
import {useSearchParams} from "react-router-dom";
import {Terminal} from "xterm";
import {FitAddon} from "xterm-addon-fit";
import request from "../../common/request";
import {Affix, Button, Drawer, message} from "antd";
import Message from "../access/Message";
import qs from "qs";
import {Base64} from "js-base64";
import {wsServer} from "../../common/env";
import Draggable from "react-draggable";
import {FolderOutlined} from "@ant-design/icons";
import FileSystem from '../devops/FileSystem';
import "xterm/css/xterm.css"
import {debounce} from "../../utils/fun";
import {xtermScrollPretty} from "../../utils/xterm-scroll-pretty";
import NoMatch from '../NoMatch';

const Term = () => {

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

    const [box, setBox] = useState({width: window.innerWidth, height: window.innerHeight});

    let [term, setTerm] = useState();
    let [fitAddon, setFitAddon] = useState();
    let [websocket, setWebsocket] = useState();
    let [session, setSession] = useState({});

    let [fileSystemVisible, setFileSystemVisible] = useState(false);
    let [enterBtnZIndex, setEnterBtnZIndex] = useState(999);

    const createSession = async (assetId) => {
        let result = await request.post(`/quick?assetId=${assetId}`);
        if (result['code'] !== 1) {
            return [undefined, result['message']];
        }
        return [result['data'], ''];
    }

    const writeErrorMessage = (term, message) => {
        term.writeln(`\x1B[1;3;31m${message}\x1B[0m `);
    }

    const focus = () => {
        if (term) {
            term.focus();
        }
    }

    const fit = () => {
        if (fitAddon) {
            fitAddon.fit();
        }
    }

    const onWindowResize = () => {
        setBox({width: window.innerWidth, height: window.innerHeight});
    };

    const init = async (assetId) => {
        let term = new Terminal({
            fontFamily: 'monaco, Consolas, "Lucida Console", monospace',
            fontSize: 15,
            theme: {
                background: '#1b1b1b'
            },
        });
        let elementTerm = document.getElementById('terminal');
        term.open(elementTerm);
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        fitAddon.fit();
        term.focus();

        if (!assetId) {
            writeErrorMessage(term, `Parameters are missing, please close this page and reopen it.`)
            return;
        }

        let [session, errMsg] = await createSession(assetId);
        if (!session) {
            writeErrorMessage(term, `Failed to create session, ${errMsg}.`)
            return;
        }

        let sessionId = session['id'];

        term.writeln('Connecting...');

        document.body.oncopy = (event) => {
            event.preventDefault();
            if (session['copy'] === '0') {
                message.warn('Copy disabled')
                return false;
            } else {
                return true;
            }
        }

        document.body.onpaste = (event) => {
            event.preventDefault();
            if (session['paste'] === '0') {
                message.warn('Paste disabled')
                return false;
            } else {
                return true;
            }
        }

        let params = {
            'cols': term.cols,
            'rows': term.rows,
            'payload': payloadParam,
        };

        let paramStr = qs.stringify(params);

        let webSocket = new WebSocket(`${wsServer}/quick/${sessionId}/ssh?${paramStr}`);

        let pingInterval;
        webSocket.onopen = (e => {
            pingInterval = setInterval(() => {
                webSocket.send(new Message(Message.Ping, "").toString());
            }, 10000);
            xtermScrollPretty();
        });

        webSocket.onerror = (e) => {
            writeErrorMessage(term, `websocket error ${e.data}`)
        }

        webSocket.onclose = (e) => {
            console.log(`e`, e);
            term.writeln("Connection closed");
            if (pingInterval) {
                clearInterval(pingInterval);
            }
        }

        term.onData(data => {
            if (webSocket !== undefined) {
                webSocket.send(new Message(Message.Data, data).toString());
            }
        });

        webSocket.onmessage = (e) => {
            let msg = Message.parse(e.data);
            switch (msg['type']) {
                case Message.Connected:
                    term.clear();
                    break;
                case Message.Data:
                    term.write(msg['content']);
                    break;
                case Message.Closed:
                    console.log(`Server notification, needs to close the connection`)
                    term.writeln(`\x1B[1;3;31m${msg['content']}\x1B[0m `);
                    webSocket.close();
                    break;
                default:
                    break;
            }
        }

        setSession(session);
        setTerm(term);
        setFitAddon(fitAddon);
        setWebsocket(webSocket);
    }

    const handleUnload = (e) => {
        const message = "Do you want to leave?";
        (e || window.event).returnValue = message; //Gecko + IE
        return message;
    }

    useEffect(() => {
        document.title = assetName;
        init(assetId);
    }, [assetId]);

    useEffect(() => {
        if (term && websocket && fitAddon && websocket.readyState === WebSocket.OPEN) {
            fit();
            focus();
            let terminalSize = {
                cols: term.cols,
                rows: term.rows
            }
            websocket.send(new Message(Message.Resize, window.btoa(JSON.stringify(terminalSize))).toString());
        }
        // window.addEventListener('beforeunload', handleUnload);

        let resize = debounce(() => {
            onWindowResize();
        });

        window.addEventListener('resize', resize);

        return () => {
            // if (websocket) {
            //     websocket.close();
            // }
            window.removeEventListener('resize', resize);
            // window.removeEventListener('beforeunload', handleUnload);
        }
    }, [box.width, box.height]);

    return (
        <div>
            <div id='terminal' style={{
                overflow: 'hidden',
                height: box.height,
                width: box.width,
                backgroundColor: '#1b1b1b'
            }}/>

            <Draggable>
                <Affix style={{position: 'absolute', bottom: 50, right: 50, zIndex: enterBtnZIndex}}>
                    <Button icon={<FolderOutlined/>} type='primary' shape='circle' onClick={() => {
                        setFileSystemVisible(true);
                        setEnterBtnZIndex(999); // The zIndex of the xterm.js input box is 1000. This button should be hidden after the file management page pops up.
                    }}/>
                </Affix>
            </Draggable>

            <Drawer
                title={'Browse File'}
                placement="right"
                width={window.innerWidth * 0.8}
                closable={true}
                // maskClosable={false}
                onClose={() => {
                    setFileSystemVisible(false);
                    setEnterBtnZIndex(1001); // The zIndex of the xterm.js input box is 1000. This button should be hidden after the file management page pops up.
                    focus();
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
        </div>
    );
};

export default Term;