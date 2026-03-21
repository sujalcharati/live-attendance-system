import mongoose from "mongoose"


const userSchema = new mongoose.Schema({
    
    name : String,
    email : String,
    password : String,
    role : {
        type : String,
        enum : [ 'student', 'teacher']
    }
})

const classSchema = new mongoose.Schema({
    className: String,
    teacherId : {
        type : mongoose.Schema.Types.ObjectId,
        ref : "User"
    },
    studentIds : [{
        type: mongoose.Schema.Types.ObjectId,
        ref : "User"
    }]
})

const attendanceSchema = new mongoose.Schema({
    classId : {
        type : mongoose.Schema.Types.ObjectId,
        ref : "Class"
    },
    studentId : {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    status :{
        type : String,
        enum : [ "present", "absent"]
    }
})

export const User = mongoose.model("User", userSchema);
export const Class = mongoose.model("Class", classSchema);
export const Attendance = mongoose.model( "Attendance",attendanceSchema);



