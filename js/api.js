/**
 * 智能背诵助手 - 后端API调用封装
 */

const API_BASE_URL = 'http://localhost:3000/api/v1';

/**
 * 调用腾讯云ASR识别语音
 */
async function callTencentASR(audioBase64, language = 'zh') {
    try {
        const response = await fetch(`${API_BASE_URL}/asr/sentence`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                audioBase64: audioBase64,
                audioFormat: 'wav',
                sampleRate: 16000,
                language: language
            })
        });

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('API调用失败:', error);
        throw error;
    }
}

/**
 * 调用AI教师获取反馈
 */
async function callAITeacher(question, context = {}) {
    try {
        const response = await fetch(`${API_BASE_URL}/teacher/ask`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                question: question,
                context: context
            })
        });

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('AI教师API调用失败:', error);
        throw error;
    }
}

/**
 * 获取预置内容列表
 */
async function getPresetContents() {
    try {
        const response = await fetch(`${API_BASE_URL}/content/presets`);
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('获取预置内容失败:', error);
        return [];
    }
}

/**
 * 获取用户历史记录
 */
async function getUserHistory(userId) {
    try {
        const response = await fetch(`${API_BASE_URL}/user/${userId}/history`);
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('获取历史记录失败:', error);
        return [];
    }
}

/**
 * 保存背诵记录
 */
async function saveRecitationRecord(record) {
    try {
        const response = await fetch(`${API_BASE_URL}/user/record`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(record)
        });

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('保存记录失败:', error);
        throw error;
    }
}

/**
 * 调用OCR服务识别图片
 */
async function callOCRService(imageBase64) {
    try {
        const response = await fetch(`${API_BASE_URL}/ocr/recognize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                imageBase64: imageBase64,
                language: 'chinese'
            })
        });

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('OCR服务调用失败:', error);
        throw error;
    }
}