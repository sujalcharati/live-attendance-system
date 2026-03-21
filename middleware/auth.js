import jwt from "jsonwebtoken";

export const authMiddleware = ( req, res, next ) =>{


    const token = req.headers.authorization;

    if( !token){
        return res.status(401).json({
            success: false,
            error : "Unauthorized, token missing or invalid"
        })
    }

    const YOUR_SECRET = process.env.YOUR_SECRET;

    try{
        const decoded = jwt.verify(token, YOUR_SECRET);
        
        if( !decoded){
            return res.status(400).json({
                success: false ,
                error : " fail to verify"
            })
        }

        req.user = { userId: decoded.userId, role : decoded.role };
    
    
        next();

    }catch(err){

        console.error(`failed to verify jwt token${err}`);

    }
    


}