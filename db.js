import mongoose from "mongoose";

export const connection = async ()=>{

    const conn = await mongoose.connect(process.env.MONGO_URL);

    if( !conn){
        throw new Error(" db connection failed...");

    }

}