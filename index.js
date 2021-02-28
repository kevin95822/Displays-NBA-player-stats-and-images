//=============global===================================
const fs = require('fs');
const http = require('http');
const https = require("https");
const url = require("url");
const querystring = require('querystring');
const crypto = require("crypto");

//===============NBA API stuffs=========================

//======================================================

//===============IMGUR API stuffs======================
const {client_id, client_secret, response_type, grant_type} = require("./auth/credentials.json");
//======================================================


const port = 4571;
const server = http.createServer();

const states =[];

var input;

server.on("request", connection_handler);
function connection_handler(req, res){
    console.log(`New request for ${req.url}`);
    res.writeHead(200,"OK");
    if(req.url == '/'){
        const main = fs.createReadStream('html/main.html');
        res.writeHead(200,{'Content-Type':'text/html'});
        main.pipe(res);
    }
    else if(req.url == '/favicon.ico'){
		let main = fs.createReadStream('images/icon.jpg');
		res.writeHead(200,{'Content-Type':'image/x-icon'});
		main.pipe(res);
	}
	else if(req.url == '/images/nickyoung.webp'){
		let main = fs.createReadStream('images/nickyoung.webp');
		res.writeHead(200,{'Content-Type':'image/jpeg'});
		main.pipe(res);
    }
    else if(req.url.startsWith('/images/incoming/')){
        const image_stream = fs.createReadStream(`.${req.url}`);
		image_stream.on('error',image_error_handler);
		function image_error_handler(err){
			res.writeHead(404,{'Content-Type':'text/plain'});
			res.write("404 Not Found", ()=>res.end());
		}
		image_stream.on('ready',deliver_image);
		function deliver_image(){
			res.writeHead(200,{'Content-Type':'image/jpeg'});
			image_stream.pipe(res);
		}
    }
    else if(req.url.startsWith('/search')){
        input = url.parse(req.url,true).query;

        res.writeHead(200,{"Content-Type":"text/html"});

        const state = crypto.randomBytes(20).toString("hex");
        states.push({input,res});

        authorization(state,res);

    }else if(req.url.startsWith("/receive_code")){
        let user_input = input.name;
        console.log(user_input);
		const {code, state} = url.parse(req.url, true).query;
        console.log(code,state);
        get_token(code,user_input,res); 
    }
    else{
        res.write("404 Not Found", ()=>res.end());
    }
}


server.on("listening", listening_handler);
function listening_handler(){
	console.log(`Now Listening on Port ${port}`);
}

server.listen(port);

//===============================================nba========================================================================
function search_req(input,res){
    var data = "";
    var list = [];
    var results = {
        NAME:[],
        TEAM:[],
        PPG:[],
        REBODUNGS:[],
        ASSISTS:[],
        STEALS:[],
        BLOCKS:[]
    };
    let params = new URLSearchParams(input);
    const search_endpoint = 'https://stats.nba.com/stats/leagueleaders?LeagueID=00&PerMode=PerGame&StatCategory=PTS&Season=2019-20&SeasonType=Regular%20Season&Scope=RS';
    const nba_req = https.request(search_endpoint, copy_to_JSON);

    nba_req.on('err',error_handler);
    function error_handler(err){throw err};

    nba_req.on('response', copy_to_JSON);
    function copy_to_JSON(msg){
        stream_to_message(msg,message => {
            data = JSON.stringify(message);
            list = JSON.parse(message).resultSet.rowSet;
            //search_player(param_data,input,res);
            for(let i = 0; i < list.length; i++){
                if(params.get('name') === list[i][2].toLowerCase() || params.get('name') === list[i][2]){
                    results.NAME.push(list[i][2]);
                    results.TEAM.push(list[i][3]);
                    results.PPG.push(list[i][22]);
                    results.REBODUNGS.push(list[i][17]);
                    results.ASSISTS.push(list[i][18]);
                    results.STEALS.push(list[i][19]);
                    results.BLOCKS.push(list[i][20]);
                    return results;
                }
            }
        });
    }
    nba_req.write(data);
}

function stream_to_message(stream,callback){
	let body = "";
	stream.on("data",(chunk) => body += chunk);
	stream.on("end",() => callback(body));
}

//==========================================IMGUR=============================================================

function authorization(state,res){
    const authorization_endpoint = "https://api.imgur.com/oauth2/authorize";
    let uri = querystring.stringify({client_id,response_type,state})
    res.writeHead(302,{Location:`${authorization_endpoint}?${uri}`}).end();
}

function get_token(code,u_input,res){
    let body="";
    
    const endpoint = "https://api.imgur.com/oauth2/token";

    var post_data = querystring.stringify({client_id,client_secret,grant_type,code});

    var headers = {
        'Content-Type':"application/x-www-form-urlencoded"
    };

    var options = {
        method:"POST",
        headers: headers
    };

    let token_req = https.request(endpoint,options);
    token_req.on("err", error);
    function error(err){
        if(err)throw err;
    }

    token_req.on("response", post_auth_cb);
    function post_auth_cb(msg){
        stream_to_message(msg, message=>{
            body = JSON.parse(message);
            receive_token(body,u_input,res);
        })
     }

    token_req.end(post_data);
}

function receive_token(body,u_input,res){
    var token = body;
    imgur_search_request(token,u_input,res);
}

function imgur_search_request(token,input,res){

    let body = "";
    let linkbody = "";
    let links = "";
    const endpoint = `https://api.imgur.com/3/gallery/search/?q=${input}`;
    console.log(`${endpoint}`);
    let options = {
        method: "GET",
        headers:{
            Authorization:`Bearer ${token.access_token}`
        }
    };

    let search_request = https.request(endpoint, options);

    search_request.on("err", error);
    function error(err){
        if(err)throw err;
    }

    search_request.on("response", save);
    function save(msg){
      stream_to_message(msg,message=>{
          //console.log(message);
          body = JSON.stringify(message);
          linkbody = JSON.parse(message).data;
          receive_search_results(linkbody,res,input);
      });
    }
    search_request.write(body);
}

function receive_search_results(body,res,input){
    let results = [];
    let links = [];
    let img_link = [];
    let img_links = [];

    let cutdown_links = [];

    for(let i = 0; i<body.length; i++){
        try{body[i].images[i] === "undefined"}
        catch (TypeError){
            i++;
        }
        results.push(body[i].images);
    }
    links = results.flat(1);
    //console.log(links);

    for(var p in links){
        try{img_link = links[p].link;}
        catch(TypeError){p++};
        img_links.push(img_link);
    }

    for(let i = 0; i<img_links.length; i++){
        if(img_links[i].slice(0,5) === "https"){
            if(img_links[i].slice(28) != "mp4"){
                cutdown_links.push(img_links[i]);
            }
        }
    }
    const downloaded_img = {
        images : [], 
        total : cutdown_links.length
    };
    //search_req(input, res);
    download_from_links(cutdown_links,downloaded_img,res,input);

    //let stats = search_req(input,res);
    //res.write(`${stats}`);
}

function download_from_links(batch,downloaded_img,res,input){
    let tokenized_url = "";
    let filename;
    
    for(let i = 0; i<batch.length;i++){
        const image_req = https.get(batch[i]);
        tokenized_url = batch[i].split("/");
        filename = tokenized_url[tokenized_url.length-1]
        let img_path = `images/incoming/${filename}`;
        image_req.on("response",function receive_images_data(image_stream){
            const stored_image = fs.createWriteStream(img_path,{encoding:null});
            image_stream.pipe(stored_image);
            stored_image.on("finish",function(){
                downloaded_img.images.push(img_path);
                console.log("Downloaded Image", img_path);
                if(downloaded_img.images.length == downloaded_img.total){
                    generate_webpage(downloaded_img.images, res, input);
                }
            })
        })
    }
}

function generate_webpage(downloaded_imgs,res,input){
    let stats = search_req(input,res);
    let show_images = downloaded_imgs.map(img_url => `<img src="${img_url}" />`).join("");
    res.writeHead(200,{"Content-Type":"text/html"});
    //search_req(input, res);
    res.end(`<h1>${input}</h1> </h1>${stats}</h1> ${show_images}`);
}