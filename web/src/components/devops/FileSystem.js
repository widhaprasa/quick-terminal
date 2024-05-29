import React, {Component, lazy, Suspense} from 'react';
import {
    Button,
    Card,
    Form,
    Input,
    message,
    Modal,
    notification,
    Popconfirm,
    Progress,
    Space,
    Table,
    Tooltip,
    Typography
} from "antd";
import {
    CloudUploadOutlined,
    DeleteOutlined,
    DownloadOutlined,
    EditOutlined,
    ExclamationCircleOutlined,
    FileExcelOutlined,
    FileImageOutlined,
    FileMarkdownOutlined,
    FileOutlined,
    FilePdfOutlined,
    FileTextOutlined,
    FileWordOutlined,
    FileZipOutlined,
    FolderAddOutlined,
    FolderTwoTone,
    FormOutlined,
    LinkOutlined,
    ReloadOutlined,
    UploadOutlined
} from "@ant-design/icons";
import qs from "qs";
import request from "../../common/request";
import {server} from "../../common/env";
import {download, getFileName, isEmpty, renderSize} from "../../utils/utils";
import './FileSystem.css';
import Landing from "../Landing";

const MonacoEditor = lazy(() => import('react-monaco-editor'));

const {Text} = Typography;
const confirm = Modal.confirm;

class FileSystem extends Component {

    mkdirFormRef = React.createRef();
    renameFormRef = React.createRef();

    state = {
        storageType: undefined,
        storageId: undefined,
        currentDirectory: '/',
        currentDirectoryInput: '/',
        files: [],
        loading: false,
        currentFileKey: undefined,
        selectedRowKeys: [],
        uploading: {},
        callback: undefined,
        minHeight: 280,
        upload: false,
        download: false,
        delete: false,
        rename: false,
        edit: false,
        editorVisible: false,
        fileName: '',
        fileContent: ''
    }

    componentDidMount() {
        if (this.props.onRef) {
            this.props.onRef(this);
        }

        if (!this.props.storageId) {
            return
        }
        this.setState({
            storageId: this.props.storageId,
            storageType: this.props.storageType,
            callback: this.props.callback,
            minHeight: this.props.minHeight,
            upload: this.props.upload,
            download: this.props.download,
            delete: this.props.delete,
            rename: this.props.rename,
            edit: this.props.edit,
        }, () => {
            this.loadFiles(this.state.currentDirectory);
        });
    }

    reSetStorageId = (storageId) => {
        this.setState({
            storageId: storageId
        }, () => {
            this.loadFiles('/');
        });
    }

    refresh = async () => {
        this.loadFiles(this.state.currentDirectory);
        if (this.state.callback) {
            this.state.callback();
        }
    }

    loadFiles = async (key) => {
        this.setState({
            loading: true
        })
        try {
            if (isEmpty(key)) {
                key = '/';
            }
            let formData = new FormData();
            formData.append('dir', key);
            let result = await request.post(`/${this.state.storageType}/${this.state.storageId}/ls`, formData);
            if (result['code'] !== 1) {
                message.error(result['message']);
                return;
            }

            let data = result['data'];

            const items = data.map(item => {
                return {'key': item['path'], ...item}
            });

            const sortByName = (a, b) => {
                let a1 = a['name'].toUpperCase();
                let a2 = b['name'].toUpperCase();
                if (a1 < a2) {
                    return -1;
                }
                if (a1 > a2) {
                    return 1;
                }
                return 0;
            }

            let dirs = items.filter(item => item['isDir'] === true);
            dirs.sort(sortByName);

            let files = items.filter(item => item['isDir'] === false);
            files.sort(sortByName);

            dirs.push(...files);

            if (key !== '/') {
                dirs.splice(0, 0, {key: '..', name: '..', path: '..', isDir: true, disabled: true})
            }

            this.setState({
                files: dirs,
                currentDirectory: key,
                currentDirectoryInput: key
            })
        } finally {
            this.setState({
                loading: false,
                selectedRowKeys: []
            })
        }

    }

    handleCurrentDirectoryInputChange = (event) => {
        this.setState({
            currentDirectoryInput: event.target.value
        })
    }

    handleCurrentDirectoryInputPressEnter = (event) => {
        this.loadFiles(event.target.value);
    }

    handleUploadDir = () => {
        let files = window.document.getElementById('dir-upload').files;
        let uploadEndCount = 0;
        const increaseUploadEndCount = () => {
            uploadEndCount++;
            return uploadEndCount;
        }
        for (let i = 0; i < files.length; i++) {
            let relativePath = files[i]['webkitRelativePath'];
            let dir = relativePath.substring(0, relativePath.length - files[i].name.length);
            this.uploadFile(files[i], this.state.currentDirectory + '/' + dir, () => {
                if (increaseUploadEndCount() === files.length) {
                    this.refresh();
                }
            });
        }
    }

    handleUploadFile = () => {
        let files = window.document.getElementById('file-upload').files;
        let uploadEndCount = 0;
        const increaseUploadEndCount = () => {
            uploadEndCount++;
            return uploadEndCount;
        }
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file) {
                return;
            }
            this.uploadFile(file, this.state.currentDirectory, () => {
                if (increaseUploadEndCount() === files.length) {
                    this.refresh();
                }
            });
        }
    }

    uploadFile = (file, dir, callback) => {
        const {name, size} = file;
        let url = `${server}/${this.state.storageType}/${this.state.storageId}/upload?dir=${dir}`

        const key = name;
        const xhr = new XMLHttpRequest();
        let prevPercent = 0, percent = 0;

        const uploadEnd = (success, message) => {
            if (success) {
                let description = (
                    <React.Fragment>
                        <div>{name}</div>
                        <div>{renderSize(size)} / {renderSize(size)}</div>
                        <Progress percent={100}/>
                    </React.Fragment>
                );
                notification.success({
                    key,
                    message: `Upload success`,
                    duration: 5,
                    description: description,
                    placement: 'bottomRight'
                });
                if (callback) {
                    callback();
                }
            } else {
                let description = (
                    <React.Fragment>
                        <div>{name}</div>
                        <Text type="danger">{message}</Text>
                    </React.Fragment>
                );
                notification.error({
                    key,
                    message: `Upload Failed`,
                    duration: 10,
                    description: description,
                    placement: 'bottomRight'
                });
            }
        }

        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                let description = (
                    <React.Fragment>
                        <div>{name}</div>
                        <div>{renderSize(event.loaded)}/{renderSize(size)}</div>
                        <Progress percent={99}/>
                    </React.Fragment>
                );
                if (event.loaded === event.total) {
                    notification.info({
                        key,
                        message: `Transfering...`,
                        duration: null,
                        description: description,
                        placement: 'bottomRight',
                        onClose: () => {
                            xhr.abort();
                            message.info(`Upload canceled: "${name}"`, 10);
                        }
                    });
                    return;
                }
                percent = Math.min(Math.floor(event.loaded * 100 / event.total), 99);
                if (prevPercent === percent) {
                    return;
                }
                description = (
                    <React.Fragment>
                        <div>{name}</div>
                        <div>{renderSize(event.loaded)} / {renderSize(size)}</div>
                        <Progress percent={percent}/>
                    </React.Fragment>
                );

                notification.info({
                    key,
                    message: `Uploading...`,
                    duration: null,
                    description: description,
                    placement: 'bottomRight',
                    onClose: () => {
                        xhr.abort();
                        message.info(`Upload canceled: "${name}"`, 10);
                    }
                });
                prevPercent = percent;
            }

        }, false)
        xhr.onreadystatechange = (data) => {
            if (xhr.readyState !== 4) {
                let responseText = data.currentTarget.responseText;
                let result = responseText.split(`㊥`).filter(item => item !== '');
                if (result.length > 0) {
                    let upload = result[result.length - 1];
                    let uploadToTarget = parseInt(upload);

                    percent = Math.min(Math.floor(uploadToTarget * 100 / size), 99);

                    let description = (
                        <React.Fragment>
                            <div>{name}</div>
                            <div>{renderSize(uploadToTarget)}/{renderSize(size)}</div>
                            <Progress percent={percent}/>
                        </React.Fragment>
                    );
                    notification.info({
                        key,
                        message: `Transferring...`,
                        duration: null,
                        description: description,
                        placement: 'bottomRight',
                        onClose: () => {
                            xhr.abort();
                            message.info(`Upload canceled: "${name}"`, 10);
                        }
                    });
                }
                return;
            }
            if (xhr.status >= 200 && xhr.status < 300) {
                uploadEnd(true, `Upload success`);
            } else if (xhr.status >= 400 && xhr.status < 500) {
                uploadEnd(false, 'Internal Server Error');
            }
        }

        xhr.onerror = () => {
            uploadEnd(false, 'Internal Server Error');
        }
        xhr.open('POST', url, true);
        let formData = new FormData();
        formData.append("file", file, name);
        xhr.send(formData);
    }

    delete = async (key) => {
        let formData = new FormData();
        formData.append('file', key);
        let result = await request.post(`/${this.state.storageType}/${this.state.storageId}/rm`, formData);
        if (result['code'] !== 1) {
            message.error(result['message']);
        }
    }

    showEditor = async (name, key) => {
        message.loading({key: key, content: 'Loading'})
        let fileContent = await request.get(`${server}/${this.state.storageType}/${this.state.storageId}/download?file=${window.encodeURIComponent(key)}&t=${new Date().getTime()}`);
        this.setState({
            currentFileKey: key,
            fileName: name,
            fileContent: fileContent + "",
            editorVisible: true
        })
        message.destroy(key);
    }

    hideEditor = () => {
        this.setState({
            editorVisible: false,
            fileName: '',
            fileContent: '',
            currentFileKey: ''
        })
    }

    edit = async () => {
        this.setState({
            confirmLoading: true
        })
        let url = `${server}/${this.state.storageType}/${this.state.storageId}/edit`
        let formData = new FormData();
        formData.append('file', this.state.currentFileKey);
        formData.append('fileContent', this.state.fileContent);
        let result = await request.post(url, formData);
        if (result['code'] !== 1) {
            message.error(result['message']);
        }
        this.setState({
            confirmLoading: false
        })
        this.hideEditor();
    }

    render() {

        const columns = [
            {
                title: 'Name',
                dataIndex: 'name',
                key: 'name',
                render: (value, item) => {
                    let icon;
                    if (item['isDir']) {
                        icon = <FolderTwoTone/>;
                    } else {
                        if (item['isLink']) {
                            icon = <LinkOutlined/>;
                        } else {
                            const fileExtension = item['name'].split('.').pop().toLowerCase();
                            switch (fileExtension) {
                                case "doc":
                                case "docx":
                                    icon = <FileWordOutlined/>;
                                    break;
                                case "xls":
                                case "xlsx":
                                    icon = <FileExcelOutlined/>;
                                    break;
                                case "bmp":
                                case "jpg":
                                case "jpeg":
                                case "png":
                                case "tif":
                                case "gif":
                                case "pcx":
                                case "tga":
                                case "exif":
                                case "svg":
                                case "psd":
                                case "ai":
                                case "webp":
                                    icon = <FileImageOutlined/>;
                                    break;
                                case "md":
                                    icon = <FileMarkdownOutlined/>;
                                    break;
                                case "pdf":
                                    icon = <FilePdfOutlined/>;
                                    break;
                                case "txt":
                                    icon = <FileTextOutlined/>;
                                    break;
                                case "zip":
                                case "gz":
                                case "tar":
                                case "tgz":
                                    icon = <FileZipOutlined/>;
                                    break;
                                default:
                                    icon = <FileOutlined/>;
                                    break;
                            }
                        }
                    }

                    return <span className={'dode'}>{icon}&nbsp;&nbsp;{item['name']}</span>;
                },
                sorter: (a, b) => {
                    if (a['key'] === '..') {
                        return 0;
                    }

                    if (b['key'] === '..') {
                        return 0;
                    }
                    return a.name.localeCompare(b.name);
                },
                sortDirections: ['descend', 'ascend'],
            },
            {
                title: 'Size',
                dataIndex: 'size',
                key: 'size',
                render: (value, item) => {
                    if (!item['isDir'] && !item['isLink']) {
                        return <span className={'dode'}>{renderSize(value)}</span>;
                    }
                    return <span className={'dode'}/>;
                },
                sorter: (a, b) => {
                    if (a['key'] === '..') {
                        return 0;
                    }

                    if (b['key'] === '..') {
                        return 0;
                    }
                    return a.size - b.size;
                },
            }, {
                title: 'Modified',
                dataIndex: 'modTime',
                key: 'modTime',
                sorter: (a, b) => {
                    if (a['key'] === '..') {
                        return 0;
                    }

                    if (b['key'] === '..') {
                        return 0;
                    }
                    return a.modTime.localeCompare(b.modTime);
                },
                sortDirections: ['descend', 'ascend'],
                render: (value, item) => {
                    return <span className={'dode'}>{value}</span>;
                },
            }, {
                title: 'Mode',
                dataIndex: 'mode',
                key: 'mode',
                render: (value, item) => {
                    return <span className={'dode'}>{value}</span>;
                },
            }, {
                title: 'Action',
                dataIndex: 'action',
                key: 'action',
                width: 210,
                render: (value, item) => {
                    if (item['key'] === '..') {
                        return undefined;
                    }
                    let disableDownload = !this.state.download;
                    let disableEdit = !this.state.edit;
                    if (item['isDir'] || item['isLink']) {
                        disableDownload = true;
                        disableEdit = true
                    }
                    return (
                        <>
                            <Tooltip title="Download">
                            <Button type="link" icon={<DownloadOutlined/>}  disabled={disableDownload} onClick={async () => {
                                download(`${server}/${this.state.storageType}/${this.state.storageId}/download?file=${window.encodeURIComponent(item['key'])}&t=${new Date().getTime()}`);
                            }}>
                            </Button>
                            </Tooltip>
                            <Tooltip title="Edit">
                            <Button type="link" icon={<FormOutlined/>} disabled={disableEdit}
                                    onClick={() => this.showEditor(item['name'], item['key'])}>
                            </Button>
                            </Tooltip>
                            <Tooltip title="Rename">
                            <Button type={'link'} icon={<EditOutlined/>} disabled={!this.state.rename} onClick={() => {
                                this.setState({
                                    renameVisible: true,
                                    currentFileKey: item['key']
                                })
                            }}>
                            </Button>
                            </Tooltip>
                            <Tooltip title="Delete">
                            <Popconfirm
                                title="Are you sure you want to delete this item?"
                                onConfirm={async () => {
                                    await this.delete(item['key']);
                                    await this.refresh();
                                }}
                            >
                                <Button type={'link'} icon={<DeleteOutlined/>} disabled={!this.state.delete} danger></Button>
                            </Popconfirm>
                            </Tooltip>
                        </>
                    );
                },
            }
        ];


        const {selectedRowKeys} = this.state;
        const rowSelection = {
            selectedRowKeys,
            onChange: (selectedRowKeys) => {
                this.setState({selectedRowKeys});
            },
            getCheckboxProps: (record) => ({
                disabled: record['disabled'],
            }),
        };
        let hasSelected = selectedRowKeys.length > 0;
        if (hasSelected) {
            if (!this.state.delete) {
                hasSelected = false;
            }
        }

        const title = (
            <div className='fs-header'>
                <div className='fs-header-left'>
                    <Input value={this.state.currentDirectoryInput} onChange={this.handleCurrentDirectoryInputChange}
                           onPressEnter={this.handleCurrentDirectoryInputPressEnter}/>
                </div>
                <div className='fs-header-right'>
                    <Space>
                        <div className='fs-header-right-item'>
                            <Tooltip title="New Directory">
                                <Button type="primary" size="small"
                                        disabled={!this.state.upload}
                                        icon={<FolderAddOutlined/>}
                                        onClick={() => {
                                            this.setState({
                                                mkdirVisible: true
                                            })
                                        }} ghost/>
                            </Tooltip>
                        </div>

                        <div className='fs-header-right-item'>
                            <Tooltip title="Upload File">
                                <Button type="primary" size="small"
                                        icon={<CloudUploadOutlined/>}
                                        disabled={!this.state.upload}
                                        onClick={() => {
                                            window.document.getElementById('file-upload').click();
                                        }} ghost/>
                                <input type="file" id="file-upload" style={{display: 'none'}}
                                       onChange={this.handleUploadFile} multiple/>
                            </Tooltip>
                        </div>

                        <div className='fs-header-right-item'>
                            <Tooltip title="Upload Directory">
                                <Button type="primary" size="small"
                                        icon={<UploadOutlined/>}
                                        disabled={!this.state.upload}
                                        onClick={() => {
                                            window.document.getElementById('dir-upload').click();
                                        }} ghost/>
                                <input type="file" id="dir-upload" style={{display: 'none'}}
                                       onChange={this.handleUploadDir} webkitdirectory='' multiple/>
                            </Tooltip>
                        </div>

                        <div className='fs-header-right-item'>
                            <Tooltip title="Refresh">
                                <Button type="primary" size="small"
                                        icon={<ReloadOutlined/>}
                                        onClick={this.refresh}
                                        ghost/>
                            </Tooltip>
                        </div>

                        <div className='fs-header-right-item'>
                            <Tooltip title="Delete Selected">
                                <Button type="primary" size="small" ghost danger disabled={!hasSelected}
                                        icon={<DeleteOutlined/>}
                                        loading={this.state.delBtnLoading}
                                        onClick={() => {
                                            let rowKeys = this.state.selectedRowKeys;
                                            const content = <div>
                                                Are you sure you want to delete the selected items?<Text style={{color: '#1890FF'}}
                                                                        strong>{rowKeys.length}</Text> items?
                                            </div>;
                                            confirm({
                                                icon: <ExclamationCircleOutlined/>,
                                                content: content,
                                                onOk: async () => {
                                                    for (let i = 0; i < rowKeys.length; i++) {
                                                        if (rowKeys[i] === '..') {
                                                            continue;
                                                        }
                                                        await this.delete(rowKeys[i]);
                                                    }
                                                    this.refresh();
                                                },
                                                onCancel() {

                                                },
                                            });
                                        }}>

                                </Button>
                            </Tooltip>
                        </div>
                    </Space>
                </div>
            </div>
        );

        return (
            <div>
                <Card title={title} bordered={true} size="small" style={{minHeight: this.state.minHeight}}>

                    <Table columns={columns}
                           rowSelection={rowSelection}
                           dataSource={this.state.files}
                           size={'small'}
                           pagination={false}
                           loading={this.state.loading}

                           onRow={record => {
                               return {
                                   onDoubleClick: event => {
                                       if (record['isDir'] || record['isLink']) {
                                           if (record['path'] === '..') {
                                               // Get the parent directory of the current directory
                                               let currentDirectory = this.state.currentDirectory;
                                               let parentDirectory = currentDirectory.substring(0, currentDirectory.lastIndexOf('/'));
                                               this.loadFiles(parentDirectory);
                                           } else {
                                               this.loadFiles(record['path']);
                                           }
                                       } else {

                                       }
                                   },
                               };
                           }}
                    />
                </Card>

                {
                    this.state.mkdirVisible ?
                        <Modal
                            title="New Directory"
                            open={this.state.mkdirVisible}
                            okButtonProps={{form: 'mkdir-form', key: 'submit', htmlType: 'submit'}}
                            onOk={() => {
                                this.mkdirFormRef.current
                                    .validateFields()
                                    .then(async values => {
                                        this.mkdirFormRef.current.resetFields();
                                        let params = {
                                            'dir': this.state.currentDirectory + '/' + values['dir']
                                        }
                                        let paramStr = qs.stringify(params);

                                        this.setState({
                                            confirmLoading: true
                                        })
                                        let result = await request.post(`/${this.state.storageType}/${this.state.storageId}/mkdir?${paramStr}`);
                                        if (result.code === 1) {
                                            message.success('Create success');
                                            this.loadFiles(this.state.currentDirectory);
                                        } else {
                                            message.error(result.message);
                                        }

                                        this.setState({
                                            confirmLoading: false,
                                            mkdirVisible: false
                                        })
                                    })
                                    .catch(info => {

                                    });
                            }}
                            confirmLoading={this.state.confirmLoading}
                            onCancel={() => {
                                this.setState({
                                    mkdirVisible: false
                                })
                            }}
                        >
                            <Form ref={this.mkdirFormRef} id={'mkdir-form'}>
                                <Form.Item name='dir' rules={[{required: true, message: 'Please enter directory name'}]}>
                                    <Input autoComplete="off" placeholder="Please enter directory name"/>
                                </Form.Item>
                            </Form>
                        </Modal> : undefined
                }

                {
                    this.state.renameVisible ?
                        <Modal
                            title="Rename"
                            open={this.state.renameVisible}
                            okButtonProps={{form: 'rename-form', key: 'submit', htmlType: 'submit'}}
                            onOk={() => {
                                this.renameFormRef.current
                                    .validateFields()
                                    .then(async values => {
                                        this.renameFormRef.current.resetFields();

                                        try {
                                            let currentDirectory = this.state.currentDirectory;
                                            if (!currentDirectory.endsWith("/")) {
                                                currentDirectory += '/';
                                            }
                                            let params = {
                                                'oldName': this.state.currentFileKey,
                                                'newName': currentDirectory + values['newName'],
                                            }

                                            if (params['oldName'] === params['newName']) {
                                                message.success('Rename success');
                                                return;
                                            }

                                            let paramStr = qs.stringify(params);

                                            this.setState({
                                                confirmLoading: true
                                            })
                                            let result = await request.post(`/${this.state.storageType}/${this.state.storageId}/rename?${paramStr}`);
                                            if (result['code'] === 1) {
                                                message.success('Rename success');
                                                this.refresh();
                                            } else {
                                                message.error(result.message);
                                            }
                                        } finally {
                                            this.setState({
                                                confirmLoading: false,
                                                renameVisible: false
                                            })
                                        }
                                    })
                                    .catch(info => {

                                    });
                            }}
                            confirmLoading={this.state.confirmLoading}
                            onCancel={() => {
                                this.setState({
                                    renameVisible: false
                                })
                            }}
                        >
                            <Form id={'rename-form'}
                                  ref={this.renameFormRef}
                                  initialValues={{newName: getFileName(this.state.currentFileKey)}}>
                                <Form.Item name='newName' rules={[{required: true, message: 'Please enter a new name'}]}>
                                    <Input autoComplete="off" placeholder="New name"/>
                                </Form.Item>
                            </Form>
                        </Modal> : undefined
                }

                <Modal
                    title={"Edit " + this.state.fileName}
                    className='modal-no-padding'
                    open={this.state.editorVisible}
                    destroyOnClose={true}
                    width={window.innerWidth * 0.8}
                    centered={true}
                    okButtonProps={{form: 'rename-form', key: 'submit', htmlType: 'submit'}}
                    onOk={this.edit}
                    confirmLoading={this.state.confirmLoading}
                    onCancel={this.hideEditor}
                >
                    <Suspense fallback={<Landing/>}>
                        <MonacoEditor
                            language="javascript"
                            height={window.innerHeight * 0.8}
                            theme="vs-dark"
                            value={this.state.fileContent}
                            options={{
                                selectOnLineNumbers: true
                            }}
                            editorDidMount={(editor, monaco) => {
                                editor.focus();
                            }}
                            editorWillUnmount={() => {

                            }}
                            onChange={(newValue, e) => {
                                this.setState(
                                    {
                                        fileContent: newValue
                                    }
                                )
                            }}
                        />
                    </Suspense>

                </Modal>
            </div>
        );
    }
}

export default FileSystem;