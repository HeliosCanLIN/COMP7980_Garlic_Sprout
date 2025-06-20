var express = require('express');
var router = express.Router();

const {generateToken} = require('../utils/auth');
const {connectToDB, ObjectId} = require("../utils/db");

var passport = require('passport');

router.use(passport.authenticate('bearer', {session: false}));

router.post('/changePassword/', async function (req, res) {
    const db = await connectToDB();
    try {
        console.log(req.body);
        var username = req.body.username;
        var password = req.body.password;
        var id=req.body.id;
        let result = await db.collection("garlic_user").findOne({ _id: new ObjectId(id) });
        if (result != null) {
            let updateResult= await db.collection("garlic_user").updateOne({_id:new ObjectId(id)}, {$set: {password: password}});
            if(updateResult!=null){
                res.json({updateResult});
            }else{
                res.status(404).json({message: "更新失败，请稍后重试"});
            }
        } else {
            res.status(404).json({message: "未找到用户"});
        }
    } catch (err) {
        res.status(400).json({message: err.message});
    } finally {
        await db.client.close();
    }
})

router.post('/deleteAcc/', async function (req, res) {
    const db = await connectToDB();
    try {
        var id=req.body.id;
        console.log(req.body);
        let updateResult= await db.collection("garlic_user").updateOne({_id:new ObjectId(id)}, {$set: {deleteFlag: 0}});
        if(updateResult!=null){
            res.json({updateResult});
        }else{
            res.status(404).json({message: "更新失败，请稍后重试"});
        }
    }catch (err){res.status(400).json({ message: err.message });}
    finally {
        await db.client.close();
    }
})

router.post('/userStat/', async function (req, res) {
    const db = await connectToDB();
    try {
        var id=req.body.id;
        let postCount= await db.collection("posts").countDocuments({"AuthorID":new ObjectId(id)});
        let commentCount= await db.collection("comments").countDocuments({"UserID":new ObjectId(id)});
        let likeCount= await db.collection("like").countDocuments({"UserID":new ObjectId(id)});

        const posts = await db.collection("posts").find({ AuthorID: new ObjectId(id) }).toArray();
        const postIDs = posts.map(post => post.PostID);

        const temPostLiked = await db.collection("like").count({
            PostID: { $in: postIDs }
        });

        const comments = await db.collection("comments").find({ UserID: new ObjectId(id) }).toArray();
        const commentsIDs = comments.map(comment => comment.CommentID);

        const temCommentLiked = await db.collection("like").count({
            CommentID: { $in: commentsIDs }
        });

        console.log(temCommentLiked);
        let result1 = temPostLiked || 0;
        let result2 = temCommentLiked|| 0;
        let beLiked=result2+result1;
        res.json({"postCount":postCount,"commentCount":commentCount,"likeCount":likeCount,"beLiked":beLiked});

    }catch (err){res.status(400).json({ message: err.message });}
    finally {
        await db.client.close();
    }
})

module.exports = router;
