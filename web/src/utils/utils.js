export function download(url) {
    let aElement = document.createElement('a');
    aElement.setAttribute('download', '');
    // aElement.setAttribute('target', '_blank');
    aElement.setAttribute('href', url);
    aElement.click();
}

export const isEmpty = (text) => {
    return text === undefined || text == null || text.length === 0;
}

export function requestFullScreen(element) {
    // Check various browsers and find the correct method
    const requestMethod = element.requestFullScreen || //W3C
        element.webkitRequestFullScreen || //FireFox
        element.mozRequestFullScreen || //Chrome etc.
        element.msRequestFullScreen; //IE11
    if (requestMethod) {
        requestMethod.call(element);
    } else if (typeof window.ActiveXObject !== "undefined") { //for Internet Explorer
        const wScript = new window.ActiveXObject("WScript.Shell");
        if (wScript !== null) {
            wScript.SendKeys("{F11}");
        }
    }
}

// Exit full screen and check browser type
export function exitFull() {
    // Check various browsers and find the correct method
    const exitMethod = document.exitFullscreen || //W3C
        document.mozCancelFullScreen || //FireFox
        document.webkitExitFullscreen || //Chrome etc.
        document.webkitExitFullscreen; //IE11
    if (exitMethod) {
        exitMethod.call(document);
    } else if (typeof window.ActiveXObject !== "undefined") { //for Internet Explorer
        const wScript = new window.ActiveXObject("WScript.Shell");
        if (wScript !== null) {
            wScript.SendKeys("{F11}");
        }
    }
}

export function renderSize(value) {
    if (null == value || value === '' || value === 0) {
        return "0 B";
    }
    const unitArr = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    let srcSize = parseFloat(value);
    let index = Math.floor(Math.log(srcSize) / Math.log(1024));
    let size = srcSize / Math.pow(1024, index);
    size = size.toFixed(2);
    return size + ' ' + unitArr[index];
}

export function getFileName(fullFileName) {
    return fullFileName.substring(fullFileName.lastIndexOf('/') + 1, fullFileName.length);
}