import request from "../common/request";

class QuickApi {
    create = async (assetsId, mode) => {
        let result = await request.post(`/${'quick'}?assetId=${assetsId}&mode=${mode}`);
        if (result['code'] !== 1) {
            return {};
        }
        return result['data'];
    }
}

const quickApi = new QuickApi();
export default quickApi;