/**
 * 智能背诵助手 - 主入口，组装各模块
 */

// ==================== 麦克风控制 ====================

function initMicButton() {
    const micBtn = document.getElementById('mic-btn');

    micBtn.addEventListener('click', (e) => {
        e.preventDefault();

        if (AppState.recitation.isPaused) {
            return;
        }

        if (AppState.recitation.isListening) {
            stopListening();
        } else {
            startListening();
        }
    });
}

function startListening() {
    if (AppState.recitation.isPaused) return;

    if (AppState.recitation.isSpeaking) {
        speechSynthesizer.stop();
    }

    if (!AppState.capabilities.microphone) {
        showToast('请使用支持麦克风的设备，并允许麦克风权限', 'error');
        return;
    }

    speechRecognizer.start(
        (text, isFinal) => {
            if (isFinal) {
                handleRecitationResult(text);
            }
        },
        (finalText) => {
            if (finalText) {
                handleRecitationResult(finalText);
            }
        },
        (error) => {
            console.error('识别错误:', error);
            showToast('语音识别失败，请检查网络连接后重试', 'error');
            updateVoiceIndicator('waiting');
        }
    );
}

function stopListening() {
    speechRecognizer.stop();
    updateVoiceIndicator('waiting');
}

/**
 * 处理背诵结果
 */
function handleRecitationResult(recitedText) {
    const currentIndex = AppState.recitation.currentIndex;
    const currentSentence = AppState.content.sentences[currentIndex];

    const evaluation = evaluateRecitation(currentSentence, recitedText);
    AppState.recitation.results[currentIndex] = evaluation;

    const lang = AppState.settings.language === 'auto' ? AppState.content.language : AppState.settings.language;
    const isEnglish = lang === 'en-US';

    if (evaluation.isCorrect) {
        const encouragements = isEnglish
            ? ['Great job!', 'Well done!', 'Excellent!', 'Perfect!', 'Amazing!']
            : ['很好！', '不错！', '真棒！', '非常好！', '太厉害了！'];
        const randomEncouragement = encouragements[Math.floor(Math.random() * encouragements.length)];
        speechSynthesizer.speak(randomEncouragement, () => {
            nextSentence();
        });
    } else {
        AppState.recitation.retryCount++;

        if (AppState.recitation.retryCount >= AppState.recitation.maxRetries) {
            const msg = isEnglish
                ? `No worries, the correct answer is "${currentSentence}". Let's move on to the next one!`
                : `没关系，正确答案是"${currentSentence}"，我们继续下一句吧！`;
            speechSynthesizer.speak(msg, () => {
                AppState.recitation.retryCount = 0;
                nextSentence();
            });
        } else {
            const remaining = AppState.recitation.maxRetries - AppState.recitation.retryCount;
            const msg = isEnglish
                ? `Close! It should be "${currentSentence}". You have ${remaining} more ${remaining === 1 ? 'chance' : 'chances'}. Try again!`
                : `接近了，应该是"${currentSentence}"，还有${remaining}次机会，再来一遍吧！`;
            speechSynthesizer.speak(msg, () => {
                setTimeout(() => startCurrentSentence(), 500);
            });
        }
    }
}

// ==================== 图片OCR功能（Tesseract.js 浏览器端实现） ====================

/**
 * 使用 Tesseract.js 进行浏览器端 OCR 识别
 * 支持中英文混合识别
 */
async function recognizeImage() {
    const btn = event.target;
    btn.textContent = '识别中...';
    btn.disabled = true;

    const imageInput = document.getElementById('image-input');
    if (!imageInput.files || !imageInput.files[0]) {
        alert('请先选择图片');
        btn.textContent = '识别文字';
        btn.disabled = false;
        return;
    }

    const file = imageInput.files[0];
    const previewImg = document.getElementById('preview-img');

    try {
        // 检测文本语言以选择合适的 OCR 语言包
        const lang = AppState.settings.language === 'auto'
            ? 'chi_sim+eng'
            : (AppState.settings.language === 'en-US' ? 'eng' : 'chi_sim');

        // 使用 Tesseract.js 进行 OCR
        const worker = await Tesseract.createWorker(lang, 1, {
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    const progress = Math.round(m.progress * 100);
                    btn.textContent = `识别中 ${progress}%...`;
                }
            }
        });

        const { data: { text } } = await worker.recognize(previewImg.src);
        await worker.terminate();

        const cleanedText = text.trim();
        if (cleanedText) {
            document.getElementById('ocr-text').value = cleanedText;
            document.getElementById('ocr-result').classList.remove('hidden');
        } else {
            alert('未能识别到文字，请确保图片清晰且包含文字内容');
        }
    } catch (error) {
        console.error('Tesseract OCR 失败:', error);

        // 降级：尝试后端 OCR 服务
        try {
            const reader = new FileReader();
            reader.readAsDataURL(file);

            reader.onload = async (e) => {
                const base64Image = e.target.result.split(',')[1];
                const result = await callOCRService(base64Image);

                if (result.success) {
                    document.getElementById('ocr-text').value = result.text;
                    document.getElementById('ocr-result').classList.remove('hidden');
                } else {
                    alert('OCR识别失败，请检查网络连接或稍后重试');
                }
            };

            reader.onerror = () => {
                alert('读取图片失败');
            };
        } catch (backendError) {
            console.error('后端OCR也失败:', backendError);
            alert('OCR识别失败，请确保图片清晰且网络正常');
        }
    } finally {
        btn.textContent = '识别文字';
        btn.disabled = false;
    }
}

// ==================== 设置事件监听 ====================

document.addEventListener('DOMContentLoaded', async () => {
    loadFromLocalStorage();
    updateHomeStats();
    selectMode('repeat');

    await detectCapabilities();

    if (!AppState.capabilities.microphone) {
        showToast('请使用支持麦克风的设备，并允许麦克风权限', 'warning');
    }

    initMicButton();

    // 设置事件监听
    const speechRateInput = document.getElementById('speech-rate');
    const speechVolumeInput = document.getElementById('speech-volume');
    const autoNextInput = document.getElementById('auto-next');
    const languageSelect = document.getElementById('language-select');

    if (speechRateInput) {
        speechRateInput.addEventListener('input', (e) => {
            AppState.settings.speechRate = parseFloat(e.target.value);
            document.getElementById('rate-value').textContent = e.target.value;
        });
    }

    if (speechVolumeInput) {
        speechVolumeInput.addEventListener('input', (e) => {
            AppState.settings.speechVolume = parseFloat(e.target.value);
            document.getElementById('volume-value').textContent = Math.round(e.target.value * 100) + '%';
        });
    }

    if (autoNextInput) {
        autoNextInput.addEventListener('change', (e) => {
            AppState.settings.autoNext = e.target.checked;
        });
    }

    if (languageSelect) {
        languageSelect.addEventListener('change', (e) => {
            AppState.settings.language = e.target.value;
            if (AppState.currentPage === 'recitation' && AppState.content.text) {
                const newLang = e.target.value === 'auto' ? detectLanguage(AppState.content.text) : e.target.value;
                speechSynthesizer.setLanguage(newLang);
                speechRecognizer.setLanguage(newLang);
                updateLanguageIndicator(newLang);
            }
        });
    }
});

window.addEventListener('beforeunload', () => {
    saveToLocalStorage();
});

// ==================== 全局函数导出 ====================

// 页面导航函数
window.showTextInput = showTextInput;
window.showImageInput = showImageInput;
window.showHistory = showHistory;
window.goHome = goHome;
window.goBack = goBack;

// 内容输入函数
window.previewContent = previewContent;
window.resetImage = resetImage;
window.recognizeImage = recognizeImage;
window.previewOCRContent = previewOCRContent;

// 模式选择函数
window.selectMode = selectMode;
window.startRecitation = startRecitation;

// 控制按钮函数
window.togglePause = togglePause;
window.repeatCurrent = repeatCurrent;
window.showHint = showHint;
window.skipCurrent = skipCurrent;
window.confirmExit = confirmExit;
window.closeExitModal = closeExitModal;
window.confirmExitRecitation = confirmExitRecitation;

// 设置函数
window.toggleSettings = toggleSettings;
window.closeSettings = closeSettings;

// 结果函数
window.retryRecitation = retryRecitation;
window.saveResult = saveResult;