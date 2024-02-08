import { asyncHandler } from "../utils/asyncHandler.js";

import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";


const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        return { accessToken, refreshToken }

    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating refresh and acces token")
    }
}

const registerUser = asyncHandler(async (req, res) => {
    //get user details from frontend
    //validation - not empty
    //check if user already exists : username , email
    //check for images, check for avatar
    //upload images to cloudinary, avatar
    //create user object - create entry in db
    //remove password and refresh token field from response
    //check for user creation
    //return response

    const { fullName, email, username, password } = req.body;

    // Check if any of the fields (fullName, email, username, password)
    // are empty or contain only whitespace characters. If any field is
    if (
        [fullName, email, username, password].some((field) => field?.trim() === "")
    ) {
        throw new ApiError(400, "ALl fields required"); // empty, throw an ApiError with status code 400 and message "All fields required".
    }

    const existerUser = await User.findOne({
        $or: [{ username }, { email }]
    });

    if (existerUser) {
        throw new ApiError(409, "User with email or username already exists");
    }
    console.log(req.files);

    // Extract the local path of the avatar file from the request object.
    // The optional chaining operator (?.) is used to safely access nested
    // properties. If any of the properties along the chain are null or
    // undefined, the expression will result in undefined.
    const avatarLocalPath = req.files?.avatar[0]?.path;


    // Check if 'req.files' exists and if 'req.files.coverImage' is an array with at least one element.
    // If both conditions are met, assign the local path of the first cover image file to 'coverImageLocalPath'.
    // This ensures that 'coverImageLocalPath' is assigned only if 'req.files.coverImage' is not null, 
    // is an array, and has at least one element, avoiding potential errors when accessing properties.
    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!avatar) {
        throw new ApiError(400, "Avatar file is required");
    }

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering");
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User Registered Successfully!!")
    )
})

const loginUser = asyncHandler(async (req, res) => {
    //req body -> data
    //username or email
    //find the user
    //password check
    //access and refresh token
    //send cookie


    const { email, username, password } = req.body
    if (!username || !email) {
        throw new ApiError(400, "username or email is required")
    }

    //find user
    const user = await User.findOne({
        $or: [{ username }, { email }]
    })

    if (!user) {
        throw new ApiError(404, "User doesnot Exist")
    }

    //check password
    const isPasswordValid = await user.isPasswordCorrect(password)
    if (!isPasswordValid) {
        throw new ApiError(401, "Password Incorrect")
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200).cookie("accessToken", accessToken, options).cookie("refreshToken", refreshToken, options).json(new ApiResponse(200, {
        user: loggedInUser, accessToken, refreshToken
    },
        "user logged in Successfully"
    )
    )
})

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )
    const options = {
        httpOnly: true,
        secure: true
    }
    return res.status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User Logged Out"))
})

export { registerUser, loginUser, logoutUser };