import axios from 'axios'
import {server} from "./env";
import {message} from 'antd';

// Test address
// axios.defaults.baseURL = server;
// Online address
axios.defaults.baseURL = server;

const handleError = (error) => {
    if ("Network Error" === error.toString()) {
        message.error('Network Error');
        return false;
    }
    if (error.response !== undefined && error.response.status === 401) {
        window.location.href = '#/login';
        return false;
    }
    if (error.response !== undefined) {
        message.error(error.response.data.message);
        return false;
    }
    return true;
};

const handleResult = (result) => {
    if (result['code'] === 401) {
        window.location.href = '#/login';
        return false;
    }if (result['code'] === 403) {
        window.location.href = '#/permission-denied';
        return false;
    } else if (result['code'] === 100) {
        return true;
    } else if (result['code'] !== 1) {
        message.error(result['message']);
        return false;
    }
    return true;
}

const request = {

    get: function (url) {
        return new Promise((resolve, reject) => {
            axios.get(url, {})
                .then((response) => {
                    let contentType = response.headers['content-type'];
                    if (contentType !== '' && contentType.includes('application/json')) {
                        handleResult(response.data);
                    }
                    resolve(response.data);
                })
                .catch((error) => {
                    if (!handleError(error)) {
                        return;
                    }
                    reject(error);
                });
        })
    },

    post: function (url, params, header) {

        const headers = {}
        if (header) {
            for (const k in header) {
                headers[k] = header[k];
            }
        }


        return new Promise((resolve, reject) => {
            axios.post(url, params, {})
                .then((response) => {
                    handleResult(response.data);
                    resolve(response.data);
                })
                .catch((error) => {
                    if (!handleError(error)) {
                        return;
                    }
                    reject(error);
                });
        })
    },

    put: function (url, params) {
        return new Promise((resolve, reject) => {
            axios.put(url, params, {})
                .then((response) => {
                    handleResult(response.data);
                    resolve(response.data);
                })
                .catch((error) => {
                    if (!handleError(error)) {
                        return;
                    }
                    reject(error);
                });
        })
    },

    delete: function (url) {
        return new Promise((resolve, reject) => {
            axios.delete(url, {})
                .then((response) => {
                    handleResult(response.data);
                    resolve(response.data);
                })
                .catch((error) => {
                    if (!handleError(error)) {
                        return;
                    }
                    reject(error);
                });
        })
    },

    patch: function (url, params) {
        return new Promise((resolve, reject) => {
            axios.patch(url, params, {})
                .then((response) => {
                    handleResult(response.data);
                    resolve(response.data);
                })
                .catch((error) => {
                    if (!handleError(error)) {
                        return;
                    }
                    reject(error);
                });
        })
    },
};
export default request
