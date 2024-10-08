require("dotenv").config();
const express = require('express')
const { createServer } = require('http')
const cookieParser = require('cookie-parser')
const bcrypt = require('bcrypt');
const app = express()

const server = createServer(app);
const { Server } = require('socket.io')
const io = new Server(server)

io.setMaxListeners(0); // Set maximum listeners to unlimited


const { userData, hostData, questionBank, teamData } = require('./src/mongodb')
const { authenticateUser } = require('./src/logic/authenticateUser')
const { authenticateHost } = require('./src/logic/authenticateHost')
const { validUsername } = require('./src/logic/validUsername')
const verifyUser = require('./src/logic/verifyUser')

app.set('view engine', 'ejs')
app.use(express.urlencoded({ extended: false }))
app.use(express.static('./public'))
app.use(cookieParser())

var bidData = { index: null, title: "", teamCode: null, amount: 0 };

io.on('connection', (socket) => {
    socket.on('host', async (index) => {

        var idx = Number(index)

        bidData.index = idx
        bidData.teamCode = null
        bidData.amount = 0

        var question = await questionBank.findOne({ index: idx })
        var title = 'Waiting for problem...';
        var tag = null
        var desc = "No problem in bid"
        if (question != null) {
            title = question.title
            tag = question.tag
            desc = question.desc
            bidData.title = title
        }
     

        io.emit('question', title, desc, tag);
    })

    //handles live bidding 
    socket.on('bid', (teamCode, amount) => {
        
        if (Number(amount) > bidData.amount) {
            bidData.teamCode = teamCode;
            bidData.amount = amount
          
            io.emit('currBidData', bidData.teamCode, bidData.amount);
        }
    })

    //handles if host aborts the current bid 
    socket.on("abortCurrBid", () => {
        var title = 'Waiting for problem...';
        var points = null
        var desc = "No problem in bid"

        io.emit("abort", title, desc, points);
    })

    socket.on("timeUp", () => {
        io.emit("timeIsUp");
    })

    //sending the latest bid info to all users  
    socket.on('update-user-data', async () => {
        await questionBank.updateOne({ index: bidData.index}, { $set: { owner: bidData.teamCode } })

        try {
            const team_Data=await teamData.findOne({team:bidData.teamCode})
            if (team_Data) {
                const updated = await teamData.updateOne({ team: bidData.teamCode }, {
                    $set: { points: Number(team_Data.points) - Number(bidData.amount)},
                    $push: { questions: bidData.title }
                })
                
                io.emit('updateInfo',bidData.title,bidData.teamCode,bidData.amount)
            }
        }
        catch (err) {
            console.log("server side error")
        }

    })


})

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/rules.html')
})

app.get('/admin', (req, res) => {
    res.render('hostLogin')
})

app.get('/signUp', (req, res) => {
    res.sendFile(__dirname + '/public/signup.html')
})

app.post('/signUp', async (req, res) => {
    const data = {
        teamCode: req.body.teamCode,
        username: req.body.username,
        password: req.body.password,
        institution: req.body.institution
    }

    const check = await validUsername(data)
    if (check.success) {
        
        try{
            const hashedPassword = await bcrypt.hash(data.password,10)
            data.password = hashedPassword
        }catch(error){
            res.json({msg:"error hashing password"})
        }

        await userData.insertMany([data])
        await teamData.insertMany({team:data.teamCode})
        res.sendFile(__dirname + '/public/login.html');
    }
    else {
        res.send(check.message)
    }

})

app.get('/login',(req,res)=>{
    res.sendFile(__dirname + '/public/login.html');
})
app.post('/login', async (req, res) => {
    const userData = {
        teamCode: req.body.teamCode,
        username: req.body.username,
        password: req.body.password
    }
    const authResult = await authenticateUser(userData,req,res);

    if (authResult.success) {
        res.redirect('./home')
    }
    else {
        res.send(authResult.message)
    }
})

app.get('/logout',(req,res)=>{
    res.clearCookie('token')

    res.redirect('/login')
})

app.get('/home',verifyUser, async (req,res)=>{

    const  userData = req.user
    const loginTeamData = await teamData.findOne({team:userData.teamCode})

    const list= await questionBank.find({})
    const newList=list.filter(question=>question.owner!=null)
    res.render('home', {userData:userData,points:loginTeamData.points,titleOwner:newList})

})

app.get('/hostLogin', (req, res) => {
    res.render('./hostLogin')
})

app.post('/hostLogin', async (req, res) => {
    const hostData = {
        username: req.body.username,
        password: req.body.password
    }
    const authResult = await authenticateHost(hostData)
    if (authResult.success) {
        res.render('hostHome', { userData: hostData })
    }
    else {
        res.send(authResult.message)
    }
})


server.listen(3000, () => {

    console.log("app started at port 3000");
})

