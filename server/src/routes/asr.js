/**
 * 腾讯云语音识别路由
 * 一句话识别 API 封装
 */

const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const router = express.Router();

// 腾讯云配置（从环境变量读取）
const TENCENT_CONFIG = {
    secretId: process.env.TENCENT_SECRET_ID || '',
    secretKey: process.env.TENCENT_SECRET_KEY || '',
    appId: process.env.TENCENT_APP_ID || '',
    region: 'ap-guangzhou',
    service: 'asr',
    version: '2019-06-14',
    host: 'asr.tencentcloudapi.com'
};

/**
 * 生成腾讯云 API 签名
 * @param {string} payload - 请求体 JSON 字符串
 * @param {number} timestamp - 时间戳
 * @param {string} date - 日期 YYYY-MM-DD
 */
function generateSignature(payload, timestamp, date) {
    // 1. 拼接规范请求
    const httpRequestMethod = 'POST';
    const canonicalUri = '/';
    const canonicalQueryString = '';
    const canonicalHeaders = `content-type:application/json\nhost:${TENCENT_CONFIG.host}\n`;
    const signedHeaders = 'content-type;host';
    const hashedRequestPayload = crypto.createHash('sha256').update(payload).digest('hex');
    const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`;

    // 2. 拼接签名字符串
    const algorithm = 'TC3-HMAC-SHA256';
    const credentialScope = `${date}/asr/tc3_request`;
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;

    // 3. 计算签名
    const secretDate = crypto.createHmac('sha256', `TC3${TENCENT_CONFIG.secretKey}`).update(date).digest();
    const secretService = crypto.createHmac('sha256', secretDate).update('asr').digest();
    const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest();
    const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');

    // 4. 拼接 Authorization
    const authorization = `${algorithm} Credential=${TENCENT_CONFIG.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return authorization;
}

/**
 * 腾讯云一句话识别
 * POST /api/v1/asr/sentence
 */
router.post('/sentence', async (req, res) => {
    try {
        const { audioBase64, audioFormat = 'wav', sampleRate = 16000, language = 'zh' } = req.body;

        if (!audioBase64) {
            return res.status(400).json({
                success: false,
                error: '缺少音频数据'
            });
        }

        // 构建请求体
        const payload = JSON.stringify({
            ProjectId: 0,
            SubServiceType: 2, // 一句话识别
            EngSerViceType: language === 'en' ? '16k_en' : '16k_zh',
            SourceType: 1, // 音频数据
            VoiceFormat: audioFormat,
            Data: audioBase64,
            DataLen: Buffer.from(audioBase64, 'base64').length
        });

        const timestamp = Math.floor(Date.now() / 1000);
        const date = new Date().toISOString().split('T')[0];
        const authorization = generateSignature(payload, timestamp, date);

        // 调用腾讯云 API
        const response = await axios.post(
            `https://${TENCENT_CONFIG.host}`,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Host': TENCENT_CONFIG.host,
                    'X-TC-Action': 'SentenceRecognition',
                    'X-TC-Version': TENCENT_CONFIG.version,
                    'X-TC-Timestamp': timestamp,
                    'X-TC-Region': TENCENT_CONFIG.region,
                    'Authorization': authorization
                },
                timeout: 10000
            }
        );

        const result = response.data;

        if (result.Response && result.Response.Result) {
            res.json({
                success: true,
                text: result.Response.Result,
                confidence: result.Response.Confidence || 0
            });
        } else if (result.Response && result.Response.Error) {
            res.status(500).json({
                success: false,
                error: result.Response.Error.Message,
                code: result.Response.Error.Code
            });
        } else {
            res.status(500).json({
                success: false,
                error: '识别失败'
            });
        }

    } catch (error) {
        console.error('腾讯云语音识别错误:', error.message);
        res.status(500).json({
            success: false,
            error: '语音识别服务暂时不可用'
        });
    }
});

module.exports = router;
