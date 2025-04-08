var express = require('express');
var router = express.Router();
const {generateToken} = require('../utils/auth');
const {connectToDB, ObjectId} = require("../utils/db");
var passport = require('passport');

router.use(passport.authenticate('bearer', {session: false}));

router.post('/createpost', async (req, res) => {
    const db = await connectToDB();
    try {
        const {title, section, content, UserID} = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({error: '标题不能为空'});
        }

        if (!section || !section.trim()) {
            return res.status(400).json({error: '内容不能为空'});
        }

        const newPost = {
            PostID: new ObjectId(), AuthorID: new ObjectId(UserID), // 实际应通过认证获取
            CreatedAt: new Date(), Title: title, Content: content, Section: section, Likes: 0, Views: 0, Comments: 0,
        };

        const result = await db.collection('posts').insertOne(newPost);
        const insertedPost = {
            ...newPost, _id: result.insertedId
        };

        res.status(201).json({
            ...insertedPost, time: formatRelativeTime(insertedPost.CreatedAt), id: insertedPost._id.toString()
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
            PostID: new ObjectId(postId),
        });

        if (!post) {
            return res.status(404).json({error: 'post not found'});
        }

        if (post.Deleted) {
            return res.status(403).json({error: 'post deleted'});
        }

        const user = await db.collection('garlic_user').findOne({
            _id: post.AuthorID
        });


        if (post.Deleted) {
            return res.status(403).json({error: 'post deleted'});
        }

        const likeCount = await db.collection('like').countDocuments({
            Type: 'Post',
            PostID: new ObjectId(postId),
            //            PostID: new ObjectId(postId),
        });

        await db.collection('posts').updateOne({PostID: new ObjectId(postId)}, {$inc: {Views: 1}});

        const responseData = {
            ...post, Author: user ? user.username : null,
            Likes: likeCount
        };


        res.json(responseData);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({error: '服务器错误'});
    }
});

router.post('/delete', async (req, res) => {
    const db = await connectToDB();
    try {
        const {PostID} = req.body;

        // 校验必要参数
        if (!PostID) {
            return res.status(400).json({error: '缺少帖子ID参数'});
        }

        // 校验ObjectID格式
        if (!ObjectId.isValid(PostID)) {
            return res.status(400).json({error: '非法的帖子ID格式'});
        }

        const postObjectId = new ObjectId(PostID);

        // 查询目标帖子
        const post = await db.collection('posts').findOne({PostID: postObjectId});
        if (!post) {
            return res.status(404).json({error: '帖子不存在'});
        }

        // 获取当前登录用户ID（通过Bearer认证中间件获取）
        const currentUserID = new ObjectId(req.user._id);

        // 鉴权：比对帖子作者ID和当前用户ID
        if (!post.AuthorID.equals(currentUserID)) {
            return res.status(403).json({error: '无权限执行此操作'});
        }

        // 执行逻辑删除
        const result = await db.collection('posts').updateOne(
            {PostID: postObjectId},
            {$set: {Deleted: true, DeletedAt: new Date()}}
        );

        if (result.modifiedCount === 0) {
            return res.status(500).json({error: '帖子删除失败'});
        }

        res.status(200).json({message: '帖子已删除'});
    } catch (error) {
        console.error('删除帖子错误:', error);
        res.status(500).json({error: '服务器内部错误'});
    }
});
// 获取评论列表
router.get('/:postId/comments', async (req, res) => {
    const db = await connectToDB();
    try {
        const {postId} = req.params;
        const page = parseInt(req.query.page) || 1;
        const pageSize = Math.min(parseInt(req.query.pageSize) || 10, 100); // 添加分页大小限制

        // 查询帖子是否存在
        const postExists = await db.collection('posts').findOne({
            PostID: new ObjectId(postId)
        });

        if (!postExists) {
            return res.status(404).json({error: '帖子未找到'});
        }

        const skip = (page - 1) * pageSize;

        // 获取分页评论
        const comments = await db.collection('comments')
            .find({PostID: new ObjectId(postId)})
            .sort({CreatedAt: -1})
            .skip(skip)
            .limit(pageSize)
            .toArray();

        // 获取评论总数
        const total = await db.collection('comments')
            .countDocuments({PostID: new ObjectId(postId)});

        // 提取并验证UserID
        const allUserIds = comments.flatMap(c => [c.UserID, c.ReplyToUserID])
            .filter(Boolean);
        const validUserIds = [];
        const invalidUsers = new Set();

        allUserIds.forEach(id => {
            try {
                validUserIds.push(new ObjectId(id)); // 有效转换
            } catch {
                invalidUsers.add(id); // 记录非法ID
            }
        });

        // 批量查询有效用户信息
        const users = await db.collection('garlic_user')
            .find({
                _id: {$in: validUserIds}, username: {$exists: true} // 确保包含用户名字段
            })
            .project({username: 1})
            .toArray();

        // 创建映射表（使用_id的字符串形式作为键）
        const userMap = users.reduce((map, user) => {
            map[user._id.toString()] = user.username;
            return map;
        }, {});

        // 获取每个评论的点赞数
        const commentIds = comments.map(comment => ({
            PostID: new ObjectId(postId),
            CommentID: comment.CommentID,
            Type: "Comment"
        }));


        let likeCounts = [];
        if (commentIds.length > 0) {
            likeCounts = await db.collection('like').aggregate([
                {
                    $match: {
                        $or: commentIds.map(({PostID, CommentID}) => ({
                            PostID,
                            CommentID,
                            Type: "Comment"
                        }))
                    }
                },
                {
                    $group: {
                        _id: {PostID: "$PostID", CommentID: "$CommentID"},
                        count: {$sum: 1}
                    }
                }
            ]).toArray();
        }

        // 创建点赞数映射表
        const likeCountMap = likeCounts.reduce((map, item) => {
            const {PostID, CommentID} = item._id;
            map[CommentID] = item.count;
            return map;
        }, {});

        // 处理评论数据
        const processedComments = comments.map(comment => {
            // 处理无效用户ID
            const isInvalidUser = invalidUsers.has(comment.UserID);
            const userName = isInvalidUser ? '无效用户' : userMap[comment.UserID] || '未知用户';

            const isInvalidReplyUser = invalidUsers.has(comment.ReplyToUserID);
            const replyToUserName = isInvalidReplyUser ? '无效用户' : userMap[comment.ReplyToUserID] || '未知用户';

            return {
                ...comment,
                UserName: userName,
                ReplyToUserName: replyToUserName,
                time: formatRelativeTime(new Date(comment.CreatedAt)),
                id: comment.CommentID.toString(),
                Likes: likeCountMap[comment.CommentID] || 0 // 添加点赞数
            };
        });

        res.json({
            data: processedComments, total, currentPage: page, totalPages: Math.ceil(total / pageSize)
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({error: '服务器错误'});
    }
});


// 提交评论
router.post('/:postId/comments', async (req, res) => {
    const db = await connectToDB();
    try {
        const {postId} = req.params;
        const {Content, replyTo, replyToUserID, UserID} = req.body;

        if (!Content || !Content.trim()) {
            return res.status(400).json({error: '评论内容不能为空'});
        }

        const post = await db.collection('posts').findOne({
            PostID: new ObjectId(postId),
        });

        if (!post) {
            return res.status(404).json({error: '帖子未找到'});
        }

        let parentComment = null;
        if (replyTo) {
            parentComment = await db.collection('comments').findOne({
                PostID: new ObjectId(postId),
                CommentID: new ObjectId(replyTo)
            });

            if (!parentComment) {
                return res.status(400).json({error: '回复的评论不存在或不属于该帖子'});
            }
        }

        const newComment = {
            CommentID: new ObjectId(),
            PostID: new ObjectId(postId),
            UserID: new ObjectId(UserID), // 实际应通过认证获取
            CreatedAt: new Date(),
            ReplyTo: parentComment ? new ObjectId(replyTo) : null,
            ReplyToUserID: parentComment ? new ObjectId(replyToUserID) : null,
            Content: Content,
            Likes: 0,
        };

        const result = await db.collection('comments').insertOne(newComment);
        const insertedComment = {
            ...newComment, _id: result.insertedId
        };

        // 更新帖子评论数
        await db.collection('posts').updateOne({PostID: new ObjectId(postId)}, {$inc: {Comments: 1}});

        res.status(201).json({
            ...insertedComment, time: formatRelativeTime(insertedComment.createdAt), id: insertedComment._id.toString()
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({error: '服务器错误'});
    }
});

router.post('/getHotLists', async function (req, res) {
    const db = await connectToDB();
    try {
        const filter = {
            Deleted: {$ne: true}
        };
        if (req.body.section) {
            filter.Section = req.body.section;
        }

        const post = await db.collection('posts')
            .find(filter)
            .sort({Views: -1})
            .limit(5);

        res.json(await post.toArray());
    } catch (err) {
        res.status(400).json({message: err.message});
    } finally {
        await db.client.close();
    }
});

router.post('/getLists/', async function (req, res) {
    const db = await connectToDB();
    try {
        const filter = {
            Deleted: {$ne: true}
        };
        if (req.body.section) {
            filter.Section = req.body.section;
        }

        if (req.body.keyword) {
            filter.Title = {$regex:req.body.keyword};
        }
        const post = await db.collection('posts')
            .find(filter)
            .sort({Views: -1});

        res.json(await post.toArray());
    } catch (err) {
        res.status(400).json({message: err.message});
    } finally {
        await db.client.close();
    }
});

router.post('/deletePost/:id', async function (req, res) {
    const db = await connectToDB();
    try {
        const {id} = req.params;
        let result = await db.collection("post").findOne({_id: new ObjectId(id)});
        if (result == null) {
            res.status(404).json({message: "No such post"});
        } else {
            let deleteResult = await db.collection("post").delete({_id: new ObjectId(id)});
            if (deleteResult > 0) {
                res.status(404).json({message: "delete failed. Please try again later"});
            } else {
                res.json(deleteResult);
            }
        }
    } catch (err) {
        res.status(400).json({message: err.message});
    } finally {
        await db.client.close();
    }
})

router.post('/deleteComments/:id', async function (req, res) {
    const db = await connectToDB();
    try {
        const {id} = req.params;
        let result = await db.collection("comments").findOne({_id: new ObjectId(id)});
        if (result == null) {
            res.status(404).json({message: "No such comments"});
        } else {
            let deleteResult = await db.collection("comments").delete({_id: new ObjectId(id)});
            if (deleteResult > 0) {
                res.status(404).json({message: "delete failed. Please try again later"});
            } else {
                res.json(deleteResult);
            }
        }
    } catch (err) {
        res.status(400).json({message: err.message});
    } finally {
        await db.client.close();
    }
})

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
