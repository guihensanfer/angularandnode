const router = require('express').Router();
const _ = require('lodash');
const Auth = require('../../repositories/authRepository');
const util = require('../../services/utilService');
const mail = require('../../services/mailService');
const DocumentTypesModel = require('../../models/documentTypesModel');
const RolesModel = require('../../models/rolesModel');
const Projects = require('../../repositories/projectsRepository');
const UsersRoles = require('../../repositories/usersRolesRepository');
const Roles = require('../../repositories/rolesRepository');
const bcrypt = require('bcrypt');
const db = require('../../db');
const ErrorLogModel = require('../../models/errorLogModel');
const jwt = require('jsonwebtoken');
const httpP = require('../../models/httpResponsePatternModel');
const axios = require('axios');
const url = require('url');
const googleAuthRedirectUri = process.env.APP_HOST + 'api/v1/auth/login/external/google/callback';

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
 *               picture:
 *                 type: string
 *                 description: Picture url
 *                 maxLength: 200
 *               document:
 *                 type: object
 *                 properties:
 *                   documentTypeId:
 *                     type: integer
 *                     description: ID of the document type
 *                   documentValue:
 *                     type: string
 *                     description: Value of the document
 *               defaultLanguage:
 *                 type: string
 *                 example: pt-br
 *                 maxLength: 50
 *             required:
 *               - firstName
 *               - email
 *               - projectId
 *     security:
 *       - JWT: []
 *     responses:
 *       '201':
 *         description: User successfully created.
 *       '400':
 *         description: Bad request, verify your request data.
 *       '422':
 *         description: Unprocessable entity, the provided data is not valid.
 *       '500':
 *         description: Internal Server Error.
 */
// router.post('/register', httpP.HTTPResponsePatternModel.authWithAdminGroup(), async (req, res) => {      
router.post('/register', async (req, res) => {      
    let response = await new httpP.HTTPResponsePatternModel(req,res).useLogs();     
    const currentTicket = response.getTicket(); 
    var { firstName, lastName, document, email, password, projectId, defaultLanguage, picture } = req.body;        
    let errors = [];  
    const authProcs = new Auth.Procs(currentTicket);
    const rolesProcs = new Roles.Procs(currentTicket);

    try
    {
        if (Object.keys(req.body).length === 0) {
            response.set(400,false);

            return await response.sendResponse();
        }

        // First Name
        if(_.isNull(firstName) || _.isEmpty(firstName)){
            errors.push(httpP.HTTPResponsePatternModel.requiredMsg('First Name'));
        }
        else if(firstName.length > Auth.MAX_FIRSTNAME_LENGTH){            
            errors.push(httpP.HTTPResponsePatternModel.lengthExceedsMsg('First Name'));        
        }

        // Last Name
        if(_.isNull(lastName) || _.isEmpty(lastName)){
            errors.push(httpP.HTTPResponsePatternModel.requiredMsg('Last Name'));
        }
        else if(lastName.length > Auth.MAX_LASTNAME_LENGTH){            
            errors.push(httpP.HTTPResponsePatternModel.lengthExceedsMsg('Last Name')); 
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
            errors.push(httpP.HTTPResponsePatternModel.requiredMsg('Email'));            
        }
        else if(email.length > Auth.MAX_EMAIL_LENGTH){
            errors.push(httpP.HTTPResponsePatternModel.lengthExceedsMsg('Email'));                     
        }
        else if(!util.isValidEmail(email)){            
            errors.push('Valid email is required.');
        }    

        // Password
        if(_.isNull(password) || _.isEmpty(password)){
            errors.push(httpP.HTTPResponsePatternModel.requiredMsg('Password'));     
        }
        else if(password.length > Auth.MAX_PASSWORD_LENGTH){
            errors.push('Password exceeds the maximum allowed length.');        
        }  

        // ProjectId
        projectId = httpP.HTTPResponsePatternModel.verifyProjectId(req, projectId);

        if(!projectId){
            errors.push(httpP.HTTPResponsePatternModel.requiredMsg('ProjectId'));                 
        }
        else{
            let project = await Projects.data.findOne({
                where: {
                    projectId: projectId
                }
            });

            if(!project){
                errors.push('ProjectId is invalid.');
            }            
        }

        // defaultLanguage
        if(!_.isNull(defaultLanguage) && !_.isEmpty(defaultLanguage)){            
            if(defaultLanguage.length > Auth.MAX_LANGUAGE_LENGTH){
                errors.push(httpP.HTTPResponsePatternModel.lengthExceedsMsg('DefaultLanguage'));                        
            }
        }     
        
         // picture
         if(!_.isNull(picture) && !_.isEmpty(picture)){            
            if(picture.length > Auth.MAX_PICTURE_LENGTH){
                errors.push(httpP.HTTPResponsePatternModel.lengthExceedsMsg('Picture'));                        
            }
        }  

        // Check if user already exists
        let userExists = await authProcs.checkUserExists(email, projectId);
        if(userExists){
            errors.push(httpP.HTTPResponsePatternModel.alreadyExistsMsg('User'));                 
        }    

        // ----- Check for errors
        if(errors && errors.length > 0){
            response.set(422,false, errors);

            return await response.sendResponse();
        }
    
    
        // Create password
        let salt = await bcrypt.genSaltSync(12);
        let passwordHash = await bcrypt.hashSync(password, salt);

        // Create user and all anothers relationships
        await Auth.createUser({
                firstName: firstName.trim(),
                lastName: lastName?.trim(),
                email: email?.trim(),
                password: passwordHash,
                document: document.documentValue?.trim(),
                documentTypeId: document.documentTypeId,
                projectId: projectId,
                defaultLanguage: defaultLanguage?.trim(),
                picture: picture?.trim()
            }, RolesModel.ROLE_USER, currentTicket);        

        response.set(201, true, null, null, 'The creation was successful. An email confirmation has been sent to the user.');
        return await response.sendResponse();
    }
    catch(err){
        let errorModel = ErrorLogModel.DefaultForEndPoints(req, err, currentTicket);

        await db.errorLogInsert(errorModel);

        response.set(500, false, [err.message]);      
        return await response.sendResponse();
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
 *               projectId:
 *                 type: integer
 *               password:
 *                 type: string
 *                 maxLength: 300
 *               continueWithToken:
 *                 type: string
 *                 description: Use this parameter to continue with a token. 1 After the log in, a new refresh token is generated. 2. To obtain a new access token using refresh token, send only the token without including any additional attributes.
 *                 example: string // TODO If you have this, then send only the token without including any additional attributes
 *     responses:
 *       '200':
 *         description: Log in was successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ticket:
 *                   type: string
 *                   description: The ticket of the request
 *                 message:
 *                   type: string
 *                   description: Message indicating successful login
 *                 success:
 *                   type: boolean
 *                   description: Indicates if the login was successful
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: List of errors (null in case of success)
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                       description: User authentication token
 *                     expiredAccessAt:
 *                       type: string
 *                       format: date-time
 *                       description: Access token expiration date and time
 *                     refreshToken:
 *                       type: string
 *                       description: Use the refresh token for seamless future authentication. If you wish to utilize the refresh token for logging in, include only the refresh token in your request.
 *                     expiredRefreshAt:
 *                       type: string
 *                       format: date-time
 *                       description: Refresh token expiration date and time
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
    let response = await new httpP.HTTPResponsePatternModel(req,res).useLogs();      
    const currentTicket = response.getTicket(); 
    var { 
        email, password, projectId, continueWithToken
    } = req.body;        
    let errors = [];
    const rolesProcs = new Roles.Procs(currentTicket);
    const authProcs = new Auth.Procs(currentTicket);
    let byPassword = true;

    try
    {  
        if (Object.keys(req.body).length === 0) {
            response.set(400,false);

            return await response.sendResponse();
        }
        
        if(_.isNull(continueWithToken) || _.isEmpty(continueWithToken)){
             // Email
            if(_.isNull(email) || _.isEmpty(email)){
                errors.push(httpP.HTTPResponsePatternModel.requiredMsg('Email'));            
            }
            else if(email.length > Auth.MAX_EMAIL_LENGTH){
                errors.push(httpP.HTTPResponsePatternModel.lengthExceedsMsg('Email'));               
            }
            else if(!util.isValidEmail(email)){
                errors.push('Valid email is required.');
            }    

            // Password
            if(_.isNull(password) || _.isEmpty(password)){
                errors.push(httpP.HTTPResponsePatternModel.requiredMsg('Password'));
            }
            else if(password.length > Auth.MAX_PASSWORD_LENGTH){
                errors.push(httpP.HTTPResponsePatternModel.lengthExceedsMsg('Password'));
            }  

            // ProjectId
            if(!projectId){
                errors.push(httpP.HTTPResponsePatternModel.requiredMsg('ProjectId'));
            }
            else{
                let project = await Projects.data.findOne({
                    where: {
                        projectId: projectId
                    }
                });

                if(!project){
                    errors.push('ProjectId is invalid.');
                }
            }   
        }
        else
        {
            if(email || password || projectId){
                response.set(400, false, null, null, "Send only token without including any additional attributes.");
                return await response.sendResponse();
            }

            const userID = await authProcs.userTokenVerify(continueWithToken, req.ip);

            if(!userID || userID <= 0){
                response.set(401, false);
                return await response.sendResponse();
            }

            const user = await Auth.data.findOne({
                where: {
                    userId: userID
                }
            });

            if(!user){
                response.set(401, false);
                return await response.sendResponse();
            }            

            email = user.email;
            projectId = user.projectId;
            byPassword = false;
        }                

        // ----- Check for errors
        if(errors && errors.length > 0){
            response.set(422, false, errors);
            return await response.sendResponse();
        }
    
        // Check user
        let user = await Auth.data.findOne({
            where: {
                email: email,
                projectId: projectId
            }
        });

        if(!user){
            response.set(404, false);
            return await response.sendResponse();
        }
        else if(!user.enabled){
            response.set(401, false, null, null, "The account is locked out.");
            return await response.sendResponse();
        }
        else if(!user.emailConfirmed){
            response.set(401, false, null, null, "Email is not confirmed.");
            return await response.sendResponse();
        }
        else if(byPassword) {
            let checkPassword = await bcrypt.compare(password, user.password);
            if(!checkPassword){
                response.set(401, false);
                return await response.sendResponse();
            }            
        }

        let userRoles = await UsersRoles.data.findAll({
            where: {
                userId: user.userId
            }
        });

        const roleIds = userRoles.map(x => x.roleId);

        if(!userRoles || userRoles.length <= 0){
            throw new Error(httpP.HTTPResponsePatternModel.cannotGetMsg('User role'));
        }

        const roleNames = await rolesProcs.getRoleArrayNamesByIds(roleIds);    

        let secret = process.env.SECRET;        
        let token = jwt.sign({            
            id: user.userId,
            userEmail: user.email,
            userName: user.firstName,
            projectId: user.projectId,
            roles: [roleNames]
        },
        secret,
        {
            expiresIn: process.env.JWT_ACCESS_EXPIRATION + 'm'
        });        

        const accessExpiresAt = new Date();
        const refreshExpiresAt = new Date();

        accessExpiresAt.setMinutes(accessExpiresAt.getMinutes() + parseInt(process.env.JWT_ACCESS_EXPIRATION));        
        refreshExpiresAt.setMinutes(refreshExpiresAt.getMinutes() + parseInt(process.env.JWT_REFRESH_EXPIRATION));

        const refresh = await authProcs.userTokenCreate(user.userId, refreshExpiresAt, req.ip, 'REFRESH_TOKEN');

        const result = {
            accessToken: token,
            accessExpiredAt: accessExpiresAt,
            refreshToken: refresh,
            refreshExpiredAt: refreshExpiresAt
        };

        response.set(200, true, null, result);
        return await response.sendResponse();
    }
    catch(err){                 
        const errorModel = ErrorLogModel.DefaultForEndPoints(req, err, currentTicket);

        await db.errorLogInsert(errorModel);
      
        response.set(500, false, [err.message]);
        return await response.sendResponse();
    } 
});

/**
 * @swagger
 * /auth/login/external/redirect:
 *   get:
 *     summary: Redirect to external logging.
 *     description: Redirect to external logging based on token with context.
 *     tags:
 *       - Auth
 *     parameters:
 *       - name: token
 *         in: query
 *         description: Token with context for redirect.
 *         required: true
 *         type: string
 *         maxLength: 100
 *     responses:
 *       '422':
 *         description: Unprocessable entity, the provided data is not valid. 
 *       '401':
 *         description: Log in unauthorized.
 *       '500':
 *         description: Internal Server Error.
 */
router.get('/login/external/redirect', async (req, res) => {    
    let response = await new httpP.HTTPResponsePatternModel(req,res).useLogs();     
    const currentTicket = response.getTicket();            
    let errors = [];  
    const authProcs = new Auth.Procs(currentTicket);   
    // From auth jwt
    const token = req.query.token;

    try
    {
        
        // token
        if(_.isNull(token) || _.isEmpty(token)){
            errors.push(httpP.HTTPResponsePatternModel.requiredMsg('token'));
        }

        // ----- Check for errors
        if(errors && errors.length > 0){
            response.set(422, false, errors);
            return await response.sendResponse();
        }                                  
        
        // Check token
        const tokenRedirect = await authProcs.userTokenVerifyAll(token);
        
        if(!tokenRedirect || tokenRedirect.result <= 0 || !tokenRedirect.data || _.isNull(tokenRedirect.data) || _.isEmpty(tokenRedirect.data)){
            response.set(401, false);
            return await response.sendResponse();
        }        

        // Redirect to external uri with custom parameter token
        res.redirect(tokenRedirect.data);
    }
    catch(err){
        let errorModel = ErrorLogModel.DefaultForEndPoints(req, err, currentTicket);

        await db.errorLogInsert(errorModel);

        response.set(500, false, [err.message]);      
        return await response.sendResponse();
    }    
});

/**
 * @swagger
 * /auth/login/external/google:
 *   post:
 *     summary: Token for logging in with Google.
 *     description: Allows you to generate a token to use in the /external/redirect endpoint for completing the login process with Google.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               redirectUri:
 *                 type: string
 *                 format: uri
 *                 maxLength: 500
 *                 required: true
 *     responses:
 *       '200':
 *         description: Process was successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ticket:
 *                   type: string
 *                   description: The ticket of the request
 *                 message:
 *                   type: string
 *                   description: Message indicating the process small description
 *                 success:
 *                   type: boolean
 *                   description: Indicates if the process was successful
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: List of errors (null in case of success)
 *                 data:
 *                   type: object
 *                   properties:
 *                     tokenForRedirect:
 *                       type: string
 *                       description: Token allows you to use in the /external/redirect endpoint.
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                       description: Token expiration date and time
 *       '400':
 *         description: Bad request, verify your request data.
 *       '422':
 *         description: Unprocessable entity, the provided data is not valid. 
 *       '401':
 *         description: Log in unauthorized.
 *       '500':
 *         description: Internal Server Error.
 */
router.post('/login/external/google', httpP.HTTPResponsePatternModel.authWithAdminGroup(), async (req, res) => {
    let response = await new httpP.HTTPResponsePatternModel(req,res).useLogs();     
    const currentTicket = response.getTicket(); 
    var { redirectUri } = req.body;        
    let errors = [];  
    const authProcs = new Auth.Procs(currentTicket);   
    // From auth jwt
    let projectId = req.user.projectId; 

    try
    {
        if (Object.keys(req.body).length === 0) {
            response.set(400,false);

            return await response.sendResponse();
        }

        // Redirect Uri
        if(_.isNull(redirectUri) || _.isEmpty(redirectUri)){
            errors.push(httpP.HTTPResponsePatternModel.requiredMsg('Redirect Uri'));
        }
        else if(redirectUri.length > 500){            
            errors.push(httpP.HTTPResponsePatternModel.lengthExceedsMsg('Redirect Uri'));        
        }     
        else if(!util.isValidURI(redirectUri))  {
            errors.push('Invalid Redirect Uri');        
        }

        // ProjectId
        projectId = httpP.HTTPResponsePatternModel.verifyProjectId(req, projectId);

        if(!projectId){
            errors.push(httpP.HTTPResponsePatternModel.requiredMsg('ProjectId'));                 
        }
        else{
            let project = await Projects.data.findOne({
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
            response.set(422, false, errors);
            return await response.sendResponse();
        }                                  
        
        // Create tokens
        const redirectTokenExpiresAt = new Date();        
        const dataTokenExpiresAt = new Date();        

        redirectTokenExpiresAt.setMinutes(redirectTokenExpiresAt.getMinutes() + parseInt(process.env.JWT_ACCESS_EXPIRATION));
        dataTokenExpiresAt.setMinutes(redirectTokenExpiresAt.getMinutes() + parseInt(process.env.JWT_ACCESS_EXPIRATION) + 15);
        
        const ourParamData = {
            projectId: projectId,
            redirectUri: redirectUri,
            originRequestIp: req.ip, // Used to improve secure on the final callback redirect (prevent http intercepts token parameter)
            provider: 'Google'
        };
        const tokenForData = await authProcs.userTokenCreate(req.user.id, dataTokenExpiresAt, null, 'EXTERNAL_OAUTH_DATA', JSON.stringify(ourParamData));        
        const clientId = process.env.GOOGLE_CLIENT_ID;  
        const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${googleAuthRedirectUri}&response_type=code&scope=profile email&state=${encodeURIComponent(tokenForData)}`;
        const tokenForRedirect = await authProcs.userTokenCreate(req.user.id, redirectTokenExpiresAt,null, 'EXTERNAL_OAUTH_REDIRECT', url);

        const result = {
            tokenForRedirect: tokenForRedirect,
            expiresAt: redirectTokenExpiresAt
        }
        response.set(200, true, null, result);

        return await response.sendResponse();
    }
    catch(err){
        let errorModel = ErrorLogModel.DefaultForEndPoints(req, err, currentTicket);

        await db.errorLogInsert(errorModel);

        response.set(500, false, [err.message]);      
        return await response.sendResponse();
    }    
});

router.get('/login/external/google/callback', async (req, res) => {
    let response = await new httpP.HTTPResponsePatternModel(req,res).useLogs();     
    const currentTicket = response.getTicket(); 
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const { code, state } = req.query;
    const authProcs = new Auth.Procs(currentTicket);   
  
    try {
      // Exchange authorization code for access token
      const { data } = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: googleAuthRedirectUri,
        grant_type: 'authorization_code',
      });
  
      const { access_token, id_token } = data;
  
      // Use access_token or id_token to fetch user profile
      const { data: profile } = await axios.get('https://www.googleapis.com/oauth2/v1/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` },
      });
  
      const jsonFromInitialRequest = await authProcs.userTokenVerifyAll(state);      

      if(jsonFromInitialRequest && !_.isNull(jsonFromInitialRequest.data) && !_.isEmpty(jsonFromInitialRequest.data)){
        const obj = util.convertToJSON(jsonFromInitialRequest.data);
        
        if(obj){
            const provider = obj.provider;

            if(provider && provider == 'Google'){
                let redirectUri = obj.redirectUri;
                const projectId = obj.projectId;

                if(!redirectUri)
                {
                    response.set(400, false, null, null, 'Invalid origin data redirect uri.');      
                    return await response.sendResponse();    
                }

                if(!projectId || projectId <= 0){
                    response.set(400, false, null, null, 'Invalid origin project id.');      
                    return await response.sendResponse();    
                }

                let user = await Auth.data.findOne({                
                    where:{
                        email: profile.email,
                        projectId: projectId
                    },
                    attributes: ['userId']
                });

                if(!user){
                    // User not exists, then create user with basic profile from Google
                   

                    // Create user and others relationship
                    const newUserId = await Auth.createUser({
                        firstName: profile.given_name,
                        lastName: profile.family_name,
                        email: profile.email,
                        password: null,
                        document: null,
                        documentTypeId: null,
                        projectId: projectId,
                        defaultLanguage: profile.locale?.trim(),
                        picture: profile.picture
                    }, RolesModel.ROLE_USER, currentTicket);                    

                    user = await Auth.data.findOne({                
                        where:{
                            userId: newUserId
                        },
                        attributes: ['userId']
                    });

                    if(!user){
                        throw new Error('User has been created, but cannot be found');
                    }
                }

                // Create a refresh token for first login
                const expiresAt = new Date();                        

                expiresAt.setMinutes(expiresAt.getMinutes() + 3);
                
                const tokenFirstLogin = await authProcs.userTokenCreate(
                    user.userId, 
                    expiresAt, 
                    process.env.EXTERNAL_OATH_USE_SAME_ORIGIN_IP === 'false' ? null : obj.originRequestIp, // Production use the request ip to improve security
                    'REFRESH_TOKEN'
                );

                if(!tokenFirstLogin){
                    throw new Error(httpP.HTTPResponsePatternModel.cannotBeCreatedMsg('Token for first login'));
                }

                redirectUri += `?token=${tokenFirstLogin}`;

                res.redirect(redirectUri);
            }
            else
            {
                response.set(400, false, null, null, 'Invalid origin provider.');      
                return await response.sendResponse();
            }
        }
      }
  
      throw new Error('Cannot complete the authenticate.');
    } catch (err) {
        const errorModel = ErrorLogModel.DefaultForEndPoints(req, err, currentTicket);

        await db.errorLogInsert(errorModel);
      
        response.set(500, false, [err.message]);
        return await response.sendResponse();
    }
  });


/**
 * @swagger
 * /auth/forgetpassword:
 *   post:
 *     summary: Generate and send an email with a token to complete the reset password operation.
 *     description: It is the first step, generate and send an email with a link to click and complete the reset password operation.
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
 *               clientUri:
 *                 type: string
 *                 example: https://example.com.br
 *     security:
 *       - JWT: []
 *     responses:
 *       '200':
 *         description: The "forget password" operation has been successfully completed, an email containing a callback URL will be sent to user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ticket:
 *                   type: string
 *                   description: The ticket of the request
 *                 message:
 *                   type: string
 *                   description: Message indicating successful operation
 *                 success:
 *                   type: boolean
 *                   description: Indicates if the operation was successful
 *                   example: true
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: List of errors (null in case of success)
 *                 data:
 *                   type: object
 *                   example: null
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
router.post('/forgetpassword', httpP.HTTPResponsePatternModel.authWithAdminGroup(), async (req, res) => {    
    let response = await new httpP.HTTPResponsePatternModel(req,res).useLogs();     
    let currentTicket = response.getTicket(); 
    var { 
        email, projectId, clientUri
    } = req.body;        
    let errors = [];    
    const authProcs = new Auth.Procs(currentTicket);    

    try
    {  
        if (Object.keys(req.body).length === 0) {
            response.set(400,false);

            return await response.sendResponse();
        }
        
         // Email
         if(_.isNull(email) || _.isEmpty(email)){
            errors.push(httpP.HTTPResponsePatternModel.requiredMsg('Email'));            
        }
        else if(email.length > Auth.MAX_EMAIL_LENGTH){
            errors.push(httpP.HTTPResponsePatternModel.lengthExceedsMsg('Email'));               
        }
        else if(!util.isValidEmail(email)){
            errors.push('Valid email is required.');
        }          

        // ProjectId
        projectId = httpP.HTTPResponsePatternModel.verifyProjectId(req, projectId);
        if(!projectId){
            errors.push(httpP.HTTPResponsePatternModel.requiredMsg('ProjectId'));
        }
        else{
            let project = await Projects.data.findOne({
                where: {
                    projectId: projectId
                }
            });

            if(!project){
                errors.push('ProjectId is invalid.');
            }
        }

        // clientUri
        if(_.isNull(clientUri) || _.isEmpty(clientUri)){
            errors.push(httpP.HTTPResponsePatternModel.requiredMsg('clientUri'));            
        }
        else if(!util.isValidURI(clientUri))
        {
            errors.push('clientUri is invalid.');
        }

        // ----- Check for errors
        if(errors && errors.length > 0){
            response.set(422, false, errors);
            return await response.sendResponse();
        }
    
        // Check user
        let user = await Auth.data.findOne({
            where: {
                email: email,
                projectId: projectId
            }
        });

        if(!user){
            response.set(404, false);
            return await response.sendResponse();
        }        

        // Create token

        const accessExpiresAt = new Date();        

        accessExpiresAt.setMinutes(accessExpiresAt.getMinutes() + parseInt(process.env.JWT_ACCESS_EXPIRATION));        
        const token = await authProcs.userTokenCreate(user.userId, accessExpiresAt, req.ip, 'FORGET_PASSWORD');
        
        if(!token){
            throw new Error(httpP.HTTPResponsePatternModel.cannotBeCreatedMsg('token'));
        }
        const queryParams = {
            token: token,
            email: email
        };

        const callbackUrl = url.format({
            pathname: clientUri,
            query: queryParams
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,            
            subject: 'Forget password - Application ' + projectId + ', Bomdev',
            html: 'You forgot your password of application the ' + projectId + '.</br><a href="' + callbackUrl + '">Click here</a> to change the password.</br></br>Expires at ' + accessExpiresAt.toString() + '</br></br>Bomdev Software House'
        };

        // I prefer not to show the token in the request; it's sounds more secure to me
        // const result = {
        //     token: token,
        //     email: email,
        //     callbackUrl: callbackUrl
        // };

        mail.sendEmail(mailOptions, projectId, currentTicket);

        response.set(200, true, null, null);
        return await response.sendResponse();
    }
    catch(err){                 
        let errorModel = ErrorLogModel.DefaultForEndPoints(req, err, currentTicket);

        await db.errorLogInsert(errorModel);
      
        response.set(500, false, [err.message]);
        return await response.sendResponse();
    } 
});

/**
 * @swagger
 * /auth/resetpassword:
 *   post:
 *     summary: Change user password.
 *     description: It is the last step after was using token in the /forgetpassword end point, now will set a new user password.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 maxLength: 300
 *     security:
 *       - JWT: []
 *     responses:
 *       '200':
 *         description: Reset password was successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ticket:
 *                   type: string
 *                   description: The ticket of the request
 *                 message:
 *                   type: string
 *                   description: Message indicating successful operation
 *                 success:
 *                   type: boolean
 *                   description: Indicates if the operation was successful
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: List of errors (null in case of success)
 *                 data:
 *                   type: object
 *                   example: null
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
router.post('/resetpassword', httpP.HTTPResponsePatternModel.authWithAdminGroup(), async (req, res) => {    
    let response = await new httpP.HTTPResponsePatternModel(req,res).useLogs();     
    let currentTicket = response.getTicket(); 
    var { 
        token, newPassword
    } = req.body;        
    let errors = [];    
    const authProcs = new Auth.Procs(currentTicket);    

    try
    {  
        if (Object.keys(req.body).length === 0) {
            response.set(400,false);

            return await response.sendResponse();
        }
        
         // Token
         if(_.isNull(token) || _.isEmpty(token)){
            errors.push(httpP.HTTPResponsePatternModel.requiredMsg('Token'));            
        }
       
        
         // newPassword
         if(_.isNull(newPassword) || _.isEmpty(newPassword)){
            errors.push(httpP.HTTPResponsePatternModel.requiredMsg('newPassword'));            
        }
        else if(newPassword.length > Auth.MAX_PASSWORD_LENGTH){
            errors.push(httpP.HTTPResponsePatternModel.lengthExceedsMsg('newPassword'));               
        }        
       

        // ----- Check for errors
        if(errors && errors.length > 0){
            response.set(422, false, errors);
            return await response.sendResponse();
        }
    
        // Check token
        const _userID = await authProcs.userTokenVerify(token, req.ip);

        if(!_userID || _userID <= 0){
            response.set(401, false);
            return await response.sendResponse();
        }         

        // Create password
        let salt = await bcrypt.genSaltSync(12);
        let passwordHash = await bcrypt.hashSync(newPassword, salt);

        // Update the password
        await Auth.data.update({
            password: passwordHash
        }, {
            where: {
                userId:_userID
        }});      

        response.set(200, true, null, null);
        return await response.sendResponse();
    }
    catch(err){                 
        let errorModel = ErrorLogModel.DefaultForEndPoints(req, err, currentTicket);

        await db.errorLogInsert(errorModel);
      
        response.set(500, false, [err.message]);
        return await response.sendResponse();
    } 
});





/**
 * @swagger
 * /auth/generateOTPFor2StepVerification:
 *   post:
 *     summary: Generate and send an email with a token to complete the 2-step authentication.
 *     description: It is the first step, generate and send an email with a token to complete the 2-step authentication. Then, use end point /login and pass the token to completelly the authentication.
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
 *               clientUri:
 *                 type: string
 *                 example: https://example.com.br
 *                 description: This Uri will be utilized in the email. Upon clicking, it will be accompanied by a token.
 *     security:
 *       - JWT: []
 *     responses:
 *       '200':
 *         description: The "generateOTPFor2StepVerification" operation has been successfully completed, an email containing a callback URL will be sent to user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ticket:
 *                   type: string
 *                   description: The ticket of the request
 *                 message:
 *                   type: string
 *                   description: Message indicating successful operation
 *                 success:
 *                   type: boolean
 *                   description: Indicates if the operation was successful
 *                   example: true
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: List of errors (null in case of success)
 *                 data:
 *                   type: object
 *                   example: null
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
router.post('/generateOTPFor2StepVerification', httpP.HTTPResponsePatternModel.authWithAdminGroup(), async (req, res) => {    
    let response = await new httpP.HTTPResponsePatternModel(req,res).useLogs();       
    let currentTicket = response.getTicket(); 
    var { 
        email, projectId, clientUri
    } = req.body;        
    let errors = [];    
    const authProcs = new Auth.Procs(currentTicket);    

    try
    {  
        if (Object.keys(req.body).length === 0) {
            response.set(400,false);

            return await response.sendResponse();
        }
        
         // Email
         if(_.isNull(email) || _.isEmpty(email)){
            errors.push(httpP.HTTPResponsePatternModel.requiredMsg('Email'));            
        }
        else if(email.length > Auth.MAX_EMAIL_LENGTH){
            errors.push(httpP.HTTPResponsePatternModel.lengthExceedsMsg('Email'));               
        }
        else if(!util.isValidEmail(email)){
            errors.push('Valid email is required.');
        }          

        // ProjectId
        projectId = httpP.HTTPResponsePatternModel.verifyProjectId(req, projectId);
        if(!projectId){
            errors.push(httpP.HTTPResponsePatternModel.requiredMsg('ProjectId'));
        }
        else{
            let project = await Projects.data.findOne({
                where: {
                    projectId: projectId
                }
            });

            if(!project){
                errors.push('ProjectId is invalid.');
            }
        }

        // clientUri
        if(_.isNull(clientUri) || _.isEmpty(clientUri)){
            errors.push(httpP.HTTPResponsePatternModel.requiredMsg('clientUri'));            
        }
        else if(!util.isValidURI(clientUri))
        {
            errors.push('clientUri is invalid.');
        }

        // ----- Check for errors
        if(errors && errors.length > 0){
            response.set(422, false, errors);
            return await response.sendResponse();
        }
    
        // Check user
        let user = await Auth.data.findOne({
            where: {
                email: email,
                projectId: projectId
            }
        });

        if(!user){
            response.set(404, false);
            return await response.sendResponse();
        }        

        // Create token

        const accessExpiresAt = new Date();        

        accessExpiresAt.setMinutes(accessExpiresAt.getMinutes() + parseInt(process.env.JWT_ACCESS_EXPIRATION));        
        const token = await authProcs.userTokenCreate(user.userId, accessExpiresAt, req.ip, 'OTPFor2Step');
        
        if(!token){
            throw new Error(httpP.HTTPResponsePatternModel.cannotBeCreatedMsg('token'));
        }
        const queryParams = {
            token: token,
            email: email
        };

        const callbackUrl = url.format({
            pathname: clientUri,
            query: queryParams
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,            
            subject: 'Confirm your identity - Application ' + projectId + ', Bomdev',
            html: 'Hi, please confirm your identity to complete log in in the ' + projectId + ' application. </br><a href="' + callbackUrl + '">Click here</a> to verify your identity.</br></br>Expires at ' + accessExpiresAt.toString() + '</br></br>Bomdev Software House'
        };

        // I not prefer to show the token in the request; it's sounds more secure to me
        // const result = {
        //     token: token,
        //     email: email,
        //     callbackUrl: callbackUrl
        // };

        mail.sendEmail(mailOptions, projectId);

        response.set(200, true, null, null);
        return await response.sendResponse();
    }
    catch(err){                 
        let errorModel = ErrorLogModel.DefaultForEndPoints(req, err, currentTicket);

        await db.errorLogInsert(errorModel);
      
        response.set(500, false, [err.message]);
        return await response.sendResponse();
    } 
});


module.exports = router;