import express from 'express';
import http from 'http';
import  {  WebSocketServer } from 'ws';
import { authMiddleware } from './middleware/auth';
import {Class, User} from './models'
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { addStudentSchema, classSchema, loginSchema, signupSchema } from './validators';
import { connection } from './db.js';
import { success } from 'zod';
import { error } from 'console';


const app = express();
const port =3000;

app.use(express.json());


await connection();

// const server = http.createServer(app);
// const wss = new WebSocketServer(server);

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path : "/ws"});

server.listen(port);


    



// wss.addListener("connection",(data)=>{

//     console.log(" persistence connection started...");

// })



app.get('/health' ,( req, res)=>{
  return res.status(200).json({
    status:" server is running",
  })
})



   app.post("/auth/signup", async (req, res)=>{


    try{



      const result = signupSchema.safeParse(req.body);

      const { email} = result.data;

      if( !result.success){
         return res.status(400).json({
          success: false,
          error : "Invalid request schema"
         })
      }
  
      const userExists = await User.findOne({  email});
  
      if( userExists){
        return res.status(400).json({
          success: false,
          error: "Email already exists"
        })
      }
  
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const newUser = await User.create({
  
        name,
        password: hashedPassword,
        email,
        role
      })
  
      return res.status(201).json({
        success: true,
        "data" :{
           _id :newUser._id,
          name: newUser.name,
          email : newUser.email,
          role : newUser.role,
        }
      })
    } catch(err){
      console.error(` failed to create a user- ${err}`);
    }
   })



   app.post("/auth/login", async (req, res)=>{

    try{

      const result = loginSchema.safeParse(req.body);

      if( !result.success){
        return res.status(400).json({
          success : false,
          "error": " Invalid email or password"
        })
      }

      const { email, password} = result.data;
      
      const user = await User.findOne({email});

      if( !user){
        return res.status(400).json({
          success: false,
          error : " Invalid email or password"
        })
      }

      const isvalidPassword = await bcrypt.compare(password, user.password);

      if( !isvalidPassword){
        return res.status(400).json({
          success : false,
          error :"password provided is invalid"
        })
      }

      const secret = process.env.YOUR_SECRET;
      const jwtToken = await jwt.sign({
        userId : user._id,
        role : user.role
      },secret);

      if( !jwtToken){
        return res.status(500).json({
          success: false,
          error : " failed to create token"
        })
      }

      console.log(" token is:",jwtToken);

      return res.status(200).json({
        success: true,
        "data":{
          "token": jwtToken
        }
      })

    }catch(err){
        console.error(`failed to login-${err}`);
    }


   })


   app.get("/auth/me", authMiddleware, async ( req, res) =>{
         
    try{

      const user = await User.findById( req.user.userId);

      return res.status(200).json({
        success : true,
        "data" : {
          _id :user._id,
          name : user.name,
          email : user.email,
          role : user.role
        }
      })
       
    } catch(err){
       console.error(` failed to check the current user ${err}`)
    }

   })


   app.post("/class", authMiddleware, async (req, res)=>{
      
      if( req.user.role != "teacher"){

        return res.status(403).json({
          success : false,
          error : "Forbidden, teacher access required"
        })

      }


      const result = classSchema.safeParse(req.body);

      if( !result.success){
        return res.status(400).json({
          success: false,
          error: " Invalid request schema"
        })
      }

      const { className } = result.data;

      const classes = await Class.create({
        className,
        teacherId : req.user.userId,
        studentIds : []
        

      })

      return res.status(201).json({
        success : true,
        data: {
          _id : classes._id,
          teacherId : classes.teacherId,
          studentIds: classes.studentIds
        }
      })


   })


   app.post("/class/:id/add-student", authMiddleware, async (req, res)=>{
         if( req.user.role != "teacher"){
          return res.status(403).json({
            success : false,
            error : "Forbidden, teacher access required"
          })
         }

         const result = addStudentSchema.safeParse(req.body);

         const { studentId} = result.data;

         if( !result.success){
          return res.status(400).json({

            success : false,
            error : "Invalid request schema"
          })
         }

         const classes = await Class.findById( req.params.id );

         if( !classes) {
          return res.status(404).json({
            success : false,
            error : "Class not found"
          })
         }

         if( req.user.userId != classes.teacherId.toString()){
           return res.status(403).json({
            success: false,
            error : "Forbidden, not class teacher"
           })
         }

         const student = await User.findById(studentId);


         if( !student){
           return res.status(404).json({
            success : false,
            error : "Student not found"
           })
         }


         classes.studentIds.push(studentId);
         await classes.save();

         

        return res.status(200).json({
          success: true,
          data:{
            _id : classes._id,
            className : classes.className,
            teacherId : classes.teacherId,
            studentIds : classes.studentIds
          }
        })


   })


   app.get("/class/:id", authMiddleware, async ( req, res)=>{
           
    const classes = await Class.findById(req.params.id).populate("studentIds");

    if( !classes){
      return res.status(404).json({
        success: false,
        error : "Class not found"
      })
    }

    const isTeacher = classes.teacherId.toString() === req.user.userId;
    const isStudent = classes.studentIds.some( s => s._id.toString() === req.user.userId);

    if( !isTeacher && !isStudent){
      return res.status(403).json({
        success:false,
        error:"Forbidden"
      })
    }

    return res.status(200).json({
      success : true,
      data : {
        _id : classes._id,
        className: classes.className,
        teacherId: classes.teacherId,
        students : classes.studentIds.map( s => ({
          _id :s._id,
          name :s.name,
          email : s.email
        }))
      }
    })
   })



   app.get("/students", authMiddleware, async ( req, res )=>{

       if( req.user.role === "student"){
        return res.status(403).json({
          success: false,
          error: "Forbidden, teacher access required"
        })
       }

       const studentlist = await User.find({ role : "student"});

       return res.status(200).json({
        success: true,
        data : studentlist.map( s => ({
          _id: s._id,
          name : s.name,
          email: s.email
        }))
      
       })


   })

