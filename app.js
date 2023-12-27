require('dotenv').config();

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authController = require('./controllers/v1/authController');
const documentTypesController = require('./controllers/v1/documentTypesController');
const projectsController = require('./controllers/v1/projectsController');
const swaggerUi = require('swagger-ui-express');
const swaggerJSDoc = require('swagger-jsdoc');
const db = require('./db');
const util = require('./services/utilService');
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Bomdev API',
            version: '1.0.0',
            description: '',
        },
        host: 'localhost:3000',
        consumes: [
            'application/json'
        ],
        produces: [
            'application/json'
        ],
        servers:[
            {
                url:'http://localhost:3000/api/v1',
                description:'API Production'
            }
        ],
        tags:[
            {
                'name': 'Auth',
                'description': 'Authentication'
            },
            {
                'name': 'Document Types',
                'description': 'User Document Types'
            },
            {
                'name': 'Projects',
                'description': 'Solution projects'
            }
        ],        
        components: {
            securitySchemes: {
                JWT: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'Authorization',
                    description: 'Enter JWT token in the format "Bearer {token}"'
                }                
            }
        }
    },
    apis: [
        './controllers/v1/*.js',
        './controllers/v2/*.js'
    ], // Controllers paths
    
};  
const swaggerSpec = swaggerJSDoc(swaggerOptions);  

const app = express();
app.use(express.json());
app.listen(3000);

// Mapping

// v1
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/v1/auth', authController);
app.use('/api/v1/documentTypes', documentTypesController);
app.use('/api/v1/projects', projectsController);

// Database
(async () => {
    await db.executeProcedure('USP_TEST2',['test'])
    .then(res => {

        console.log(res[0][0][0].result);
        console.log(res[0][1][0].result);
        // var records = res[0];

        // for(var x = 0; x < res.length; x++){
        //     console.log(records[0][x].result);
        // }
    })
    .catch(ex => {
        console.log('exception: ' + ex)
    });

    // Sequelize

    const Projects = require('./repositories/projectsRepository');
    const DocumentTypes = require('./repositories/documentTypesRepository');
    const Users = require('./repositories/authRepository');
    const Roles = require('./repositories/rolesRepository');
    const UsersRoles = require('./repositories/usersRolesRepository');

    await db._sequealize.sync();
    
    Projects.findCreateFind({
        where: {
            name: 'Default'
        },
        defaults:{
            name: 'Default',
            description: 'Default'
        }
    });

    DocumentTypes.findCreateFind({
        where: {
            name: 'CPF'
        },
        defaults:{
            name: 'CPF',
            description: 'Cadastro de Pessoas Física'
        }
    });
    DocumentTypes.findCreateFind({
        where: {
            name: 'CNPJ'
        },
        defaults:{
            name: 'CNPJ',
            description: 'Cadastro Nacional de Pessoas Jurídicas'
        }
    });

    Roles.findCreateFind({
        where: {
            name: util.ROLE_ADMINISTRATOR
        },
        defaults:{
            name: util.ROLE_ADMINISTRATOR,
            description: util.ROLE_ADMINISTRATOR
        }
    });
    Roles.findCreateFind({
        where: {
            name: util.ROLE_APPLICATION
        },
        defaults:{
            name: util.ROLE_APPLICATION,
            description: util.ROLE_APPLICATION
        }
    });
    Roles.findCreateFind({
        where: {
            name: util.ROLE_USER
        },
        defaults:{
            name: util.ROLE_USER,
            description: util.ROLE_USER
        }
    });
})();
