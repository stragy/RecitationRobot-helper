const express = require('express');
const router = express.Router();
const { queryOne, query, run } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');

// AI服务配置
let aiService = null;

// 初始化AI服务
function initAIService() {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (apiKey && apiKey !== 'your-openai-api-key') {
    const OpenAI = require('openai').default;
    aiService = new OpenAI({
      apiKey: apiKey,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    });
    console.log('✅ AI服务初始化成功 (OpenAI)');
  } else {
    console.log('⚠️ 未配置AI API Key，将使用模拟响应');
  }
}

// 延迟初始化
setTimeout(initAIService, 500);

// 小爱老师对话
router.post('/chat', authMiddleware, asyncHandler(async (req, res) => {
  const { message, context, session_id } = req.body;
  
  if (!message) {
    return res.status(400).json({
      success: false,
      error: '消息不能为空'
    });
  }
  
  // 获取用户画像
  const profile = queryOne(
    'SELECT * FROM user_profiles WHERE user_id = ?',
    [req.user.id]
  );
  
  // 构建系统提示
  const systemPrompt = buildSystemPrompt(profile);
  
  // 调用AI生成回复
  let response;
  if (aiService) {
    try {
      const completion = await aiService.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          ...(context || []).map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          { role: 'user', content: message }
        ],
        max_tokens: 500,
        temperature: 0.7
      });
      
      response = completion.choices[0].message.content;
    } catch (err) {
      console.error('AI调用错误:', err);
      response = generateFallbackResponse(message);
    }
  } else {
    response = generateFallbackResponse(message);
  }
  
  res.json({
    success: true,
    data: {
      message: response,
      timestamp: new Date().toISOString()
    }
  });
}));

// 请求讲解
router.post('/explain', authMiddleware, asyncHandler(async (req, res) => {
  const { content_id, part } = req.body;
  
  // 获取内容
  const content = queryOne(
    'SELECT * FROM contents WHERE id = ?',
    [content_id]
  );
  
  if (!content) {
    return res.status(404).json({
      success: false,
      error: '内容不存在'
    });
  }
  
  // 生成讲解
  let explanation;
  if (aiService) {
    try {
      const prompt = `请用简单易懂的语言，为中小学生讲解以下古诗词${part ? '的"' + part + '"部分' : ''}：

《${content.title}》
${content.original_text}

请从以下几个方面讲解：
1. 字词含义
2. 句子意境
3. 表达的情感
4. 记忆技巧

讲解要生动有趣，适合学生理解。`;

      const completion = await aiService.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: '你是一位耐心、温暖的语文老师，擅长用生动有趣的方式讲解古诗词。' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 800,
        temperature: 0.7
      });
      
      explanation = completion.choices[0].message.content;
    } catch (err) {
      console.error('AI调用错误:', err);
      explanation = generateDefaultExplanation(content);
    }
  } else {
    explanation = generateDefaultExplanation(content);
  }
  
  res.json({
    success: true,
    data: {
      explanation,
      content_id,
      part
    }
  });
}));

// 生成提示
router.post('/hint', authMiddleware, asyncHandler(async (req, res) => {
  const { standard_text, user_input, hint_level = 1 } = req.body;
  
  // 分析差异
  const analysis = analyzeDifference(standard_text, user_input);
  
  // 根据提示级别生成提示
  let hint;
  switch (hint_level) {
    case 1:
      // 首字提示
      hint = `第一个字是"${standard_text[0]}"...`;
      break;
    case 2:
      // 前半句提示
      const halfLength = Math.ceil(standard_text.length / 2);
      hint = `前半部分是"${standard_text.slice(0, halfLength)}"，想想后面是什么？`;
      break;
    case 3:
      // 完整提示
      hint = `正确答案是："${standard_text}"，我们再来一遍吧！`;
      break;
    default:
      hint = `提示：${standard_text.slice(0, 3)}...`;
  }
  
  res.json({
    success: true,
    data: {
      hint,
      hint_level,
      analysis
    }
  });
}));

// 构建系统提示
function buildSystemPrompt(profile) {
  let style = 'gentle';
  if (profile && profile.encouragement_style) {
    style = profile.encouragement_style;
  }
  
  const styleDescriptions = {
    gentle: '温柔耐心，语速适中，多给予鼓励',
    enthusiastic: '热情活泼，充满活力，用积极的语言',
    humorous: '幽默风趣，用有趣的比喻和例子',
    strict: '严谨认真，注重准确性和细节'
  };
  
  return `你是小爱老师，一位专业、耐心、温暖的AI背诵辅导老师。

你的性格特点：
- 耐心：从不厌烦，愿意反复讲解
- 洞察：能发现学生的细微困难
- 灵活：根据学生状态调整教学方法
- 温暖：真诚的鼓励和情感支持
- 专业：深谙记忆科学和教学法

教学风格：${styleDescriptions[style] || styleDescriptions.gentle}

你的任务是：
1. 帮助学生理解背诵内容
2. 提供有效的记忆技巧
3. 给予及时的反馈和鼓励
4. 调整教学策略适应学生状态

回复要求：
- 语言简洁，适合中小学生理解
- 多用鼓励性语言
- 可以使用表情符号增加亲和力
- 每次回复不超过100字`;
}

// 生成默认讲解
function generateDefaultExplanation(content) {
  return `📚 《${content.title}》讲解

${content.translation || '这首诗描绘了一幅美丽的画面。'}

${content.background || '诗人通过这首诗表达了自己的情感。'}

💡 记忆技巧：
- 先理解意思，再记忆文字
- 可以想象画面帮助记忆
- 分段记忆，最后串联起来

加油，你一定可以背下来的！`;
}

// 生成备用响应
function generateFallbackResponse(message) {
  // 简单的关键词匹配响应
  if (message.includes('不会') || message.includes('难')) {
    return '没关系，我们慢慢来。先理解意思，再一句句记忆。你觉得哪部分最难？';
  }
  
  if (message.includes('提示') || message.includes('hint')) {
    return '好的，让我给你一些提示。先从第一个字开始想...';
  }
  
  if (message.includes('背完了') || message.includes('完成了')) {
    return '太棒了！你真的很努力！要继续保持哦~ 💪';
  }
  
  if (message.includes('累了') || message.includes('休息')) {
    return '辛苦了！学习也要注意劳逸结合，休息一下再来吧~ 😊';
  }
  
  // 默认鼓励响应
  const responses = [
    '继续加油，你做得很好！',
    '相信自己，你一定可以的！',
    '慢慢来，不着急，我会一直陪着你。',
    '每一次练习都是进步，继续努力！'
  ];
  
  return responses[Math.floor(Math.random() * responses.length)];
}

// 分析差异
function analyzeDifference(standard, user_input) {
  if (!standard || !user_input) {
    return { match_rate: 0, suggestions: ['请开始背诵'] };
  }
  
  const cleanStandard = standard.replace(/[，。！？、；：""''（）【】\s]/g, '');
  const cleanInput = user_input.replace(/[，。！？、；：""''（）【】\s]/g, '');
  
  let matchCount = 0;
  const minLen = Math.min(cleanStandard.length, cleanInput.length);
  
  for (let i = 0; i < minLen; i++) {
    if (cleanStandard[i] === cleanInput[i]) {
      matchCount++;
    }
  }
  
  const matchRate = cleanStandard.length > 0 ? matchCount / cleanStandard.length : 0;
  
  const suggestions = [];
  if (matchRate < 0.5) {
    suggestions.push('可以先理解意思再记忆');
  } else if (matchRate < 0.8) {
    suggestions.push('很接近了，注意细节');
  } else {
    suggestions.push('非常好，继续保持！');
  }
  
  return {
    match_rate: Math.round(matchRate * 100),
    suggestions
  };
}

module.exports = router;
