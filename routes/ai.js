var express = require('express');
var router = express.Router();
var passport = require('passport');
require('dotenv').config({ path: '.env' });

router.use(passport.authenticate('bearer', {session: false}));

const systemPrompt = `
Help me generate a blog post based on the following topics or keywords. 
Follow the steps below: 
Step 1: Generate a catchy blog title for me;
Step 2: Generate blog content, including an attractive beginning, content described in chapters, and conclusion; 
Step 3: Organize content according to the format of general blogs, output in markdown format; 
Do not return anything other than the blog post. 
Do not include step information. 
Do not wrap responses in quotes. 
Respond in as same as Topics or keywords language. 
`;

const userPrompt = `
Section: """{section}"""
Topics or keywords: """{title}"""
`;

router.post('/generate-content', async (req, res) => {
    try {
        const {title, section} = req.body;

        if (!title || !section) {
            return res.status(400).json({ error: '缺少必要参数：title和section' });
        }

        const response = await fetch('https://genai.hkbu.edu.hk/general/rest/deployments/gpt-4-o-mini/chat/completions?api-version=2024-02-01', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': process.env.GENAI_API_KEY || ''
            },
            body: JSON.stringify({
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt,
                    },
                    {
                        role: 'user',
                        content: userPrompt
                            .replace('{section}', section)
                            .replace('{title}', title),
                    }
                ],
                temperature: 0.7,
                max_tokens: 1000,
                stream: false,
            }),
            timeout: 10000 // 10秒超时
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`API请求失败：${response.status} - ${errorData}`);
        }

        const completion = await response.json();

        if (!completion.choices?.[0]?.message?.content) {
            throw new Error('无效的API响应结构');
        }

        res.json({
            generatedContent: completion.choices[0].message.content
        });

    } catch (error) {
        console.error('内容生成失败:', error);
        res.status(500).json({
            error: '内容生成失败',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;