const router = require('express').Router();
const _ = require('lodash');
const Auth = require('../../repositories/authRepository');
const util = require('../../services/utilService');
const DocumentTypesModel = require('../../models/documentTypesModel');
const Projects = require('../../repositories/projectsRepository');
const bcrypt = require('bcrypt');
const db = require('../../db');
const ErrorLogModel = require('../../models/errorLogModel');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register an user.
 *     description: Register a Bomdev user.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 maxLength: 100
 *               lastName:
 *                 type: string
 *                 maxLength: 100
 *               email:
 *                 type: string
 *                 format: email
 *                 maxLength: 200
 *               password:
 *                 type: string
 *                 maxLength: 300
 *               document:
 *                 type: string
 *                 maxLength: 50
 *               documentTypeId:
 *                 type: integer
 *               defaultLanguage:
 *                 type: string
 *                 example: pt-br
 *                 maxLength: 50
 *               projectId:
 *                 type: integer
 *             required:
 *               - firstName
 *               - email
 *               - projectId
 *     responses:
 *       '201':
 *         description: User has been created.
 *       '400':
 *         description: Bad request, verify your request data.
 *       '422':
 *         description: Unprocessable entity, the provided data is not valid.
 *       '500':
 *         description: Internal Server Error.
 */
router.post('/register', async (req, res) => {        
    var { firstName, lastName, document, email, password, projectId, language } = req.body;        
    let errors = [];
    try
    {
        if (Object.keys(req.body).length === 0) {
            return await util.sendResponse(res, false, 400, 'Bad request, verify your request data.');
        }

        // First Name
        if(_.isNull(firstName) || _.isEmpty(firstName)){
            errors.push('First Name is required.');
        }
        else if(firstName.length > Auth.MAX_FIRSTNAME_LENGTH){
            errors.push('First Name exceeds the maximum allowed length.');        
        }

        // Last Name
        if(_.isNull(lastName) || _.isEmpty(lastName)){
            errors.push('Last Name is required.');
        }
        else if(lastName.length > Auth.MAX_LASTNAME_LENGTH){
            errors.push('Last Name exceeds the maximum allowed length.');        
        }

        // Document
        if(document){
            let documentValid = DocumentTypesModel.isValid(document);
            if(documentValid.valid == false){
                errors.push(documentValid.msg);
            }
        }    

        // Email
        if(_.isNull(email) || _.isEmpty(email)){
            errors.push('Email is required.');
        }
        else if(email.length > Auth.MAX_EMAIL_LENGTH){
            errors.push('Email exceeds the maximum allowed length.');        
        }
        else if(!util.isValidEmail(email)){
            errors.push('Valid email is required.');
        }    

        // Password
        if(_.isNull(password) || _.isEmpty(password)){
            errors.push('Password is required.');
        }
        else if(password.length > Auth.MAX_PASSWORD_LENGTH){
            errors.push('Password exceeds the maximum allowed length.');        
        }  

        // ProjectId
        if(!projectId){
            errors.push('ProjectId is required.');
        }
        else{
            let project = await Projects.findOne({
                where: {
                    projectId: projectId
                }
            });

            if(!project){
                errors.push('ProjectId is invalid.');
            }
        }

        // Check if user already exists
        let userExists = await Auth.checkUserExists(email, projectId);
        if(userExists){
            errors.push('User already exists.');
        }    

        // ----- Check for errors
        if(errors && errors.length > 0){
            return await util.sendResponse(res, false, 422, 'Unprocessable entity, the provided data is not valid', null, errors);
        }
    
    
        // Create password
        let salt = await bcrypt.genSaltSync(12);
        let passwordHash = await bcrypt.hashSync(password, salt);

        // Create user
        await Auth.data.create({
            firstName: firstName,
            lastName: lastName,
            email: email,
            password: passwordHash,
            document: document.documentValue,
            documentTypeId: document.documentTypeId,
            projectId: projectId,
            defaultLanguage: language
        });

        return await util.sendResponse(res,true, 201, 'User has been created');
    }
    catch(err){
        let ticket = uuidv4();
        let errorLog = new ErrorLogModel(
            '/auth/register',
            0,
            3,
            err.message + err.stack,
            null,
            null,
            null,
            ticket
          );    
      
        await db.errorLogInsert(errorLog);
      
        return await util.sendResponse(res,false, 500, 'Try again later, your ticket is ' + ticket, null, [err.message]);
    }    
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in.
 *     description: Log in an user.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 maxLength: 200
 *               password:
 *                 type: string
 *                 maxLength: 300
 *               projectId:
 *                 type: integer
 *             required:
 *               - email
 *               - password
 *               - projectId
 *     responses:
 *       '200':
 *         description: Log in was successfully.
 *       '400':
 *         description: Bad request, verify your request data.
 *       '422':
 *         description: Unprocessable entity, the provided data is not valid.
 *       '404':
 *         description: User not found.
 *       '401':
 *         description: Log in unauthorized.
 *       '500':
 *         description: Internal Server Error.
 */
router.post('/login', async (req, res) => {    
    var { email, password, projectId } = req.body;        
    let errors = [];

    try
    {        
        // Email
        if(_.isNull(email) || _.isEmpty(email)){
            errors.push('Email is required.');
        }
        else if(email.length > Auth.MAX_EMAIL_LENGTH){
            errors.push('Email exceeds the maximum allowed length.');        
        }
        else if(!util.isValidEmail(email)){
            errors.push('Valid email is required.');
        }    

        // Password
        if(_.isNull(password) || _.isEmpty(password)){
            errors.push('Password is required.');
        }
        else if(password.length > Auth.MAX_PASSWORD_LENGTH){
            errors.push('Password exceeds the maximum allowed length.');        
        }  

        // ProjectId
        if(!projectId){
            errors.push('ProjectId is required.');
        }
        else{
            let project = await Projects.findOne({
                where: {
                    projectId: projectId
                }
            });

            if(!project){
                errors.push('ProjectId is invalid.');
            }
        }    

        // ----- Check for errors
        if(errors && errors.length > 0){
            return await util.sendResponse(res, false, 422, 'Unprocessable entity, the provided data is not valid', null, errors);
        }
    
        // Check user
        let user = await Auth.data.findOne({
            where: {
                email: email,
                projectId: projectId
            }
        });

        if(!user){
            return await util.sendResponse(res, false, 404, 'User not found', null, ['User not found']);
        }
        else {
            let checkPassword = await bcrypt.compare(password, user.password);
            if(!checkPassword){
                return await util.sendResponse(res, false, 401, 'Unauthorized', null, ['Unauthorized']);
            }            
        }

        let secret = process.env.SECRET;
        let token = jwt.sign({
            
            id: user.UserId            
            
        },
        secret,
        {
            expiresIn: '1h'
        })

        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1);

        return await util.sendResponse(res,true, 200, 'Log in was successfully', {
            token: token,
            expiresAt: expiresAt
        }, null);
    }
    catch(err){
        let ticket = uuidv4();
        let errorLog = new ErrorLogModel(
            '/auth/login',
            0,
            3,
            err.message + err.stack,
            null,
            null,
            null,
            ticket
          );    
      
        await db.errorLogInsert(errorLog);
      
        return await util.sendResponse(res,false, 500, 'Try again later, your ticket is ' + ticket, null, [err.message]);
    } 
});

module.exports = router;