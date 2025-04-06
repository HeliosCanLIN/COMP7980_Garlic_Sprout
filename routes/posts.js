var express = require('express');
var router = express.Router();

const {generateToken} = require('../utils/auth');
const {connectToDB, ObjectId} = require("../utils/db");



// 获取帖子详情
router.get('/:postId', async (req, res) => {
    const db = await connectToDB();
    try {
        const { postId } = req.params;

        const post = await db.collection('posts').findOne({
            PostID: parseInt(postId,10)
        });

        if (!post) {
            return res.json({ error: '帖子未找到' });
        }

        res.json(post);
    } catch (error) {
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取评论列表
router.get('/:postId/comments', async (req, res) => {
    const db = await connectToDB();
    try {
        const { postId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;

        // 修改点1: 验证postId为数字
        if (isNaN(postId)) {
            return res.status(400).json({ error: '无效的帖子ID' });
        }

        // 修改点2: 使用PostID字段查询帖子
        const postExists = await db.collection('posts').findOne({
            PostID: parseInt(postId)
        });

        if (!postExists) {
            return res.status(404).json({ error: '帖子未找到' });
        }

        const skip = (page - 1) * pageSize;

        // 修改点3: 使用PostID字段查询评论，调整排序字段
        const comments = await db.collection('comments')
            .find({ PostID: parseInt(postId) })
            .sort({ CreatedAt: -1 })  // 根据实际字段名调整
            .skip(skip)
            .limit(pageSize)
            .toArray();

        // 修改点4: 使用相同条件获取总数
        const total = await db.collection('comments')
            .countDocuments({ PostID: parseInt(postId) });

        // 修改点5: 调整字段映射关系
        const processedComments = comments.map(comment => ({
            ...comment,
            // 如果需要保留动态时间计算，使用CreatedAt字段
            time: formatRelativeTime(new Date(comment.CreatedAt)), // 假设CreatedAt是ISO格式字符串
            // 如果已有静态time字段可直接使用：time: comment.time
            id: comment.CommentID.toString()
        }));

        res.json({
            data: processedComments,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / pageSize)
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 提交评论
router.post('/:postId/comments', async (req, res) => {
    const db = await connectToDB();
    try {
        const { postId } = req.params;
        const { content, replyTo } = req.body;

        if (!content || !content.trim()) {
            return res.status(400).json({ error: '评论内容不能为空' });
        }

        if (!ObjectId.isValid(postId)) {
            return res.status(400).json({ error: '无效的帖子ID' });
        }

        const post = await db.collection('posts').findOne({
            _id: new ObjectId(postId)
        });

        if (!post) {
            return res.status(404).json({ error: '帖子未找到' });
        }

        let parentComment = null;
        if (replyTo) {
            if (!ObjectId.isValid(replyTo)) {
                return res.status(400).json({ error: '无效的回复目标ID' });
            }

            parentComment = await db.collection('comments').findOne({
                _id: new ObjectId(replyTo),
                postId: new ObjectId(postId)
            });

            if (!parentComment) {
                return res.status(400).json({ error: '回复的评论不存在或不属于该帖子' });
            }
        }

        const newComment = {
            content,
            postId: new ObjectId(postId),
            replyTo: parentComment ? new ObjectId(replyTo) : null,
            user: '当前用户', // 实际应通过认证获取
            likes: 0,
            createdAt: new Date()
        };

        const result = await db.collection('comments').insertOne(newComment);
        const insertedComment = {
            ...newComment,
            _id: result.insertedId
        };

        // 更新帖子评论数
        await db.collection('posts').updateOne(
            { _id: new ObjectId(postId) },
            { $inc: { commentsCount: 1 } }
        );

        res.status(201).json({
            ...insertedComment,
            time: formatRelativeTime(insertedComment.createdAt),
            id: insertedComment._id.toString()
        });
    } catch (error) {
        res.status(500).json({ error: '服务器错误' });
    }
});

// 保持相同的辅助函数
function formatRelativeTime(date) {
    const now = new Date();
    const diff = now - date;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) return '刚刚';
    if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
    if (diff < day) return `${Math.floor(diff / hour)}小时前`;
    return `${Math.floor(diff / day)}天前`;
}

module.exports = router;