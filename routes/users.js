var express = require('express');
var router = express.Router();

const {generateToken} = require('../utils/auth');
const {connectToDB, ObjectId} = require("../utils/db");

/* GET users listing. */
router.get('/', function (req, res, next) {
    res.send('respond with a resource');
});

router.post('/register/', async function (req, res) {
    const db = await connectToDB();
    try {
        var username = req.body.username;
        var password = req.body.password;
        delete req.body.confirmPassword;
        console.log(username, password);
        let result = await db.collection("garlic_user").findOne({username: username});
        if (result != null) {
            res.status(404).json({message: "用户名已存在"});
        } else {
            let insertResult = await db.collection("garlic_user").insertOne(req.body);
            if (insertResult > 0) {
                res.status(404).json({message: "注册失败，请稍后重试"});
            } else {
                res.json(insertResult);
            }
        }
    } catch (err) {
        res.status(400).json({message: err.message});
    } finally {
        await db.client.close();
    }
})

router.post('/login/', async function (req, res) {
    const db = await connectToDB();
    try {
        var username = req.body.username;
        var password = req.body.password;
        let result = await db.collection("garlic_user").findOne({username: username, password: password});
        if (result != null) {
            const token = generateToken(result);
            res.json({token: token, username: username,id:result._id});
        } else {
            res.status(400).json({message: "用户名或密码错误"})
        }
    } catch (err) {
        res.status(400).json({message: err.message});
    } finally {
        await db.client.close();
    }
})

router.post('/changePassword/', async function (req, res) {
    const db = await connectToDB();
    try {
        console.log(req.body);
        var username = req.body.username;
        var password = req.body.password;
        var id=req.body.id;
        let result = await db.collection("garlic_user").findOne({ _id: new ObjectId(id) });
        console.log("11");
        if (result != null) {
            console.log("22");
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

module.exports = router;
