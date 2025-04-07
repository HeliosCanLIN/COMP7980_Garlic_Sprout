var express = require('express');
var router = express.Router();

const {generateToken} = require('../utils/auth');
const {connectToDB, ObjectId} = require("../utils/db");


router.post('/CreatePost', async (req, res) => {
    const db = await connectToDB();
    try {
        const {Title, Content, Section, UserID} = req.body;

        if (!Title || !Title.trim()) {
            return res.status(400).json({error: '标题不能为空'});
        }

        if (!Content || !Content.trim()) {
            return res.status(400).json({error: '内容不能为空'});
        }

        const newPost = {
            PostID: new ObjectId(),
            UserID: new ObjectId(UserID), // 实际应通过认证获取
            CreatedAt: new Date(),
            Title: Title,
            Content: Content,
            Section: Section,
            likes: 0,
        };

        const result = await db.collection('posts').insertOne(newComment);
        const insertedPost = {
            ...newPost,
            _id: result.insertedId
        };

        res.status(201).json({
            ...insertedPost,
            time: formatRelativeTime(insertedComment.createdAt),
            id: insertedComment._id.toString()
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({error: '服务器错误'});
    }
});

// 获取帖子详情
router.get('/:postId', async (req, res) => {
    const db = await connectToDB();
    try {
        const {postId} = req.params;

        const post = await db.collection('posts').findOne({
            PostID: parseInt(postId, 10)
        });

        if (!post) {
            return res.json({error: '帖子未找到'});
        }


        res.json(post);
    } catch (error) {
        res.status(500).json({error: '服务器错误'});
    }
});

// 获取评论列表
router.get('/:postId/comments', async (req, res) => {
    const db = await connectToDB();
    try {
        const {postId} = req.params;
        const page = parseInt(req.query.page) || 1;
        const pageSize = Math.min(parseInt(req.query.pageSize) || 10, 100); // 添加分页大小限制

        // 验证postId为数字
        if (isNaN(postId)) {
            return res.status(400).json({error: '无效的帖子ID'});
        }

        // 查询帖子是否存在
        const postExists = await db.collection('posts').findOne({
            PostID: parseInt(postId)
        });

        if (!postExists) {
            return res.status(404).json({error: '帖子未找到'});
        }

        const skip = (page - 1) * pageSize;

        // 获取分页评论
        const comments = await db.collection('comments')
            .find({PostID: parseInt(postId)})
            .sort({CreatedAt: -1})
            .skip(skip)
            .limit(pageSize)
            .toArray();

        // 获取评论总数
        const total = await db.collection('comments')
            .countDocuments({PostID: parseInt(postId)});

        // 提取并验证UserID
        const allUserIds = comments.flatMap(c => [c.UserID, c.ReplyToUserID])
            .filter(Boolean);
        const validUserIds = [];
        const invalidUsers = new Set();

        allUserIds.forEach(id => {
            try {
                validUserIds.push(new ObjectId(id)); // 有效转换
            } catch {
                invalidUserIds.add(id); // 记录非法ID
            }
        });

        // 批量查询有效用户信息
        const users = await db.collection('garlic_user')
            .find({
                _id: {$in: validUserIds},
                username: {$exists: true} // 确保包含用户名字段
            })
            .project({username: 1})
            .toArray();

        // 创建映射表（使用_id的字符串形式作为键）
        const userMap = users.reduce((map, user) => {
            map[user._id.toString()] = user.username;
            return map;
        }, {});

        // 处理评论数据
        const processedComments = comments.map(comment => {
            // 处理无效用户ID
            const isInvalidUser = invalidUsers.has(comment.UserID);
            const userName = isInvalidUser
                ? '无效用户'
                : userMap[comment.UserID] || '未知用户';

            const isInvalidReplyUser = invalidUsers.has(comment.ReplyToUserID);
            const replyToUserName = isInvalidReplyUser
                ? '无效用户'
                : userMap[comment.ReplyToUserID] || '未知用户';

            return {
                ...comment,
                UserName: userName,
                ReplyToUserName: replyToUserName,
                time: formatRelativeTime(new Date(comment.CreatedAt)),
                id: comment.CommentID.toString()
            };
        });

        res.json({
            data: processedComments,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / pageSize)
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({error: '服务器错误'});
    }
});// 提交评论

// 提交评论
router.post('/:postId/comments', async (req, res) => {
    const db = await connectToDB();
    try {
        const {postId} = req.params;
        const postIdInt = parseInt(postId, 10);
        const {Content, replyTo, replyToUserID, UserID} = req.body;

        if (!Content || !Content.trim()) {
            return res.status(400).json({error: '评论内容不能为空'});
        }

        // if (!ObjectId.isValid(postId)) {
        //     return res.status(400).json({ error: '无效的帖子ID' });
        // }

        const post = await db.collection('posts').findOne({
            PostID: postIdInt
        });

        if (!post) {
            return res.status(404).json({error: '帖子未找到'});
        }

        let parentComment = null;
        if (replyTo) {
            // if (!ObjectId.isValid(replyTo)) {
            //     return res.status(400).json({ error: '无效的回复目标ID' });
            // }

            parentComment = await db.collection('comments').findOne({
                // _id: new ObjectId(replyTo),
                PostID: postIdInt,
                // CommentID: commentIdInt
                CommentID: new ObjectId(replyTo)
            });

            if (!parentComment) {
                return res.status(400).json({error: '回复的评论不存在或不属于该帖子'});
            }
        }

        const newComment = {
            CommentID: new ObjectId(),
            PostID: postIdInt,
            UserID: new ObjectId(UserID), // 实际应通过认证获取
            CreatedAt: new Date(),
            ReplyTo: parentComment ? new ObjectId(replyTo) : null,
            ReplyToUserID: parentComment ? new ObjectId(replyToUserID) : null,
            Content: Content,
            likes: 0,
        };

        const result = await db.collection('comments').insertOne(newComment);
        const insertedComment = {
            ...newComment,
            _id: result.insertedId
        };

        // 更新帖子评论数
        await db.collection('posts').updateOne(
            {PostID: postIdInt},
            {$inc: {Comments: 1}}
        );

        res.status(201).json({
            ...insertedComment,
            time: formatRelativeTime(insertedComment.createdAt),
            id: insertedComment._id.toString()
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({error: '服务器错误'});
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