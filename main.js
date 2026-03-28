import express from 'express';
import http from 'http';
import  {  WebSocketServer } from 'ws';
import { authMiddleware } from './middleware/auth';
import {Attendance, Class, User} from './models'
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { addStudentSchema, classSchema, loginSchema, signupSchema } from './validators';
import { connection } from './db.js';
import { object } from 'zod';
import { act } from 'react';



const app = express();
const port =3000;

app.use(express.json());


await connection();

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path : "/ws"});

server.listen(port);


    

let activeSession = null;

wss.on("connection", async(ws,req)=>{
   
   const url =  new URL(req.url,"http://localhost");
   const token = url.searchParams.get("token");

   if(!token){

    ws.send(JSON.stringify({
      event: "ERROR",
      data:{
         message: "Unauthorized or invalid token"
      }
    }));

    ws.close();
    return;
   }

    try{

      const decoded = jwt.verify(token,process.env.YOUR_SECRET);
      ws.user = { userId: decoded.userId, role : decoded.role};

    } catch( err){ 

      ws.send(JSON.stringify({
        event:"ERROR",
        data: {
          message : "Unauthorized or invalid token"
        }
      }))
  
      ws.close();
      return;
       }

  



   ws.on("message", async ( data)=> {
 
    const parsed = JSON.parse(data.toString());

    switch( parsed.event){

      case "ATTENDANCE_MARKED":
        
        if( ws.user.role != "teacher"){
          ws.send(JSON.stringify({
            event:"ERROR",
            data: {

              message: "Forbidden, teacher event only"
            }
          }))
          break;
        }

        if( !activeSession){
          ws.send(JSON.stringify({
            event: "ERROR",
            data :{

              message: "No active attendance session"
            }
          }))
          break;
        }

        const { studentId, status} = parsed.data;

        activeSession.attendance[studentId] = status;

        wss.clients.forEach( client =>{
          if(client.readyState === 1){
            client.send(JSON.stringify({
              event:"ATTENDANCE_MARKED",
              data: {
                studentId,
                status
              }
            }));
          }
        })


        break;

      case "TODAY_SUMMARY":

        if( ws.user.role != "teacher"){
          ws.send(JSON.stringify({
            event:"ERROR",
            data:{
              message: "Forbidden, teacher event only"

            }
          }));
          break;
        }

        if( !activeSession){
          ws.send(JSON.stringify({
            event:"ERROR",
            data :{
              message: "No active attendance session"
            }
          }))
        }

        const values = object.values(activeSession.attendance);
        const present = values.filter( v => v === "present").length;
        const absent = values.filter( v => v === "absent").length;
        const total = present+absent;

        wss.clients.forEach( client =>{

          if( client.readyState === 1){
            client.send( JSON.stringify({
              event:"TODAY_SUMMARY",
              data:{
                present,
                absent,
                total
              }
            }))
          }
        })




        break;

      case "MY_ATTENDANCE":

      if( ws.user.role != "student"){
        ws.send(JSON.stringify({
          event:"ERROR",
          data:{
            message:" Student only"
          }
        }));
        break;
      }

      const data = activeSession.attendance[ws.user.userId];

      ws.send(JSON.stringify({
        event:"MY_ATTENDANCE",
        data: {
          status: data || "not yet updated"
        }
      }));


        break;

      case "DONE":

      if( ws.user.role != "teacher"){
        ws.send(JSON.stringify({
          event:"ERROR",
          data:{
            message: "teacher only",
          }
        }))
        break;
      }

      if( !activeSession){
        ws.send(JSON.stringify({
          event:"ERROR",
          data: {
            message: "No active session!"
          }
        }));

        break;
      }

      const classData = await Class.findById(activeSession.classId);


      classData.studentIds.forEach( sId => {
        if( !activeSession.attendance[sId.toString()]){
          activeSession.attendance[sId.toString()] = "absent";
        }
      });

      for( const [studentId, status] of Object.entries(activeSession.attendance)){
        await Attendance.create({ classId: activeSession.classId, studentId, status});
      }

      const val = object.values(activeSession.attendance);
      const Present = val.filter( v => v === "present").length;
      const Absent = val.filter( v => v === "absent").length;

      const Total = Present+Absent;

      activeSession = null;

      wss.clients.forEach( client => {

        if( client.readyState == 1){
          client.send(JSON.stringify({
            event:"DONE",
            data:{
              "message" :" Attendance persisted",
              present :Present,
              absent: Absent,
              total:Total
           }
          }))
        }
      })


        break;

      default :


    }

   })
})





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



 app.post("/attendance/start",authMiddleware, async (req,res)=>{

    if( req.user.role === "student"){
      return res.status(403).json({
        success: false,
        error: "Forbidden, teacher access required"
      })
    }

    const { classId } = req.body;

    const classData = await Class.findById(classId);


    if( !classData || classData.teacherId !== req.user.userId){

      return res.status(403).json({
        success:false,
        error:"you don't own this class"
      })
    }




    if( activeSession){
      return res.status(400).json({
        success: false,
        error: "Attendance started already"
      })
    }

    activeSession = {
      classId,
      teacherId: req.user.userId,
      studentIds: [],
      startTime : new Date()
    }

    return res.status(201).json({
      success: true,
      data : {
        _id: classId,
        startedAt: startTime
      }
    })

 })



 app.get("/class/:id/my-attendance", authMiddleware, async (req, res)=>{
     

      if( req.user.role === "teacher"){
        return res.status(403).json({
          success: false,
          error: "Forbidden, student access required"
        })
      }
      
      const  classId  = req.params.id;

      
      const classData = await Class.findById(classId);
      if( !classData){
        return res.status(404).json({
          success:false,
          error: "Class not found"
        })
      }
      const isenrolled = classData.studentIds.some( sId => sId.toString() === req.user.userId.toString());

      if( !isenrolled){
        return res.status(400).json({
          success:false,
          error: "You are not enrolled in class"
        })
      }

      const record = await Attendance.findOne({
        classId:req.params.id,
        studentId: req.user.userId
      })

      if(!record){
        return res.status(200).json({
          success: true,
          data: {
            classId,
            status: record ? record.status : null
          }
        })
      }

      return res.status(200).json({
        success:true,
        data:{
          classId: classId,
          status : record.status
        }
      })

 })
