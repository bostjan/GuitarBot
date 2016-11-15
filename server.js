var request = require('request');
var cheerio = require('cheerio');
var async = require('async');
var telegram = require('telegram-bot-api');
var token = '';
var mkdirp = require('mkdirp');
var fs = require('fs');
var PDFDocument = require('pdfkit');
var jsonfile = require('jsonfile');

// Like splice but returns the spliced array.
Array.prototype.spliced = function() {
    Array.prototype.splice.apply( this, arguments );
    return( this );
};
// Returns true if element is in array.
Array.prototype.contains = function(element){
    return this.indexOf(element) > -1;
};

var supportedPages = 
[
    'tabs.ultimate-guitar.com',
    'tablatures.tk',
    'www.guitartabs.cc',
    'cifraclub.terra.com.br',
    'www.guitaretab.com',
    'acordes.lacuerda.net',
    'www.azchords.com'
];

mkdirp(__dirname+'/temp_songs/', function (err) {if (err) console.log(err)});
mkdirp(__dirname+'/usersinfo/', function (err) {if (err) console.log(err)});

var api = new telegram({
        token: token,
        updates: {
            enabled: true
    }
}); 


api.on('update', function(message)
{
	// Generic update object
	// Subscribe on it in case if you want to handle all possible
	// event types in one callback
    console.log(message);
});

api.on('message', function(message)
{
    if(message.text == '/start')
        return api.sendMessage({chat_id: message.chat.id, text: "Hello! I'm GuitarBot and I'm going to help you with all your guitar chords needs. Just send me the name of the song or the artist and I'll search it for you. Try something like:\n\n_time pink floyd_\n\nYou can use my inline function to help you search by starting your message with @guitarbot:\n\n_@guitarbot time pin_\n\nYou can also add me to a group and use the inline function to get the chords right there. Have fun and play on!", parse_mode:'Markdown'}, function (err) {if (err) console.log(err);});
    if(message.text == '/help')
        return api.sendMessage({chat_id: message.chat.id, text: "Write the name of the song and/or the artist you're looking for:\n\n_under pressure queen_\n\nYou can use the inline function to search for a song starting with @guitarbot like this:\n\n_@guitarbot under pressu_\n\nHave fun and play on!", parse_mode:'Markdown'}, function (err) {if (err) console.log(err);});
    if (message.chat.id == 14395130)
        if(message.text.split(' ')[0] == '/broadcast')
            return broadcast(message.text.split(' ').spliced(0,1).join(' '));
    saveUser(message);
    search(message.text.replace("'",""), function (results)
    {
        if(results.length == 0) // Para cuando no tiene resultados.
            return sendNoResultsMessage(message);
        else
        getTab(results[0].link, function (err, text)
        {
            if (err) console.log(err);
            else
            {
                saveTextToFile(results[0].band,results[0].song, results[0].type, text, function (err, path)
                {
                    if (err) console.log(err);
                    sendChords(message, path);
                }); 
            }
        }); 
    });
});

api.on('inline.query', function(message)
{
    searchInline(message.query.replace("'",""), function (results)
    {
        resultsToInlineSet(results, function (inlineSet)
        {
            sendInline(message, inlineSet);
        });
    });
});

function searchInline(query, cb)
{
    request // Trae la búsqueda con los parámetros del usuario
    ({
    uri: 'http://www.911tabs.com/search.php',
    method: 'POST',
    form: 
    {
        search: query
    }
    }, 
    function(error, response, body) 
    {
        if (error) return cb(error);
        var results = [];
        var $ = cheerio.load(body);
        async.forEachOf($('.line:has(.song.name)').get(), function(elem, i, callback)
        {
            
            request // Verifica que tenga chords o tabs
            ({
            uri: $(elem).find('.song.name').attr('href').replace('_tab.htm','_guitar_tab.htm').split('/').spliced(4,0,'guitar_tabs').spliced(0,1,'http://www.911tabs.com').join('/'),
            method: 'GET'
            },
            function(error, response, body) 
            {
                var $2 = cheerio.load(body);
                if ($2('.line.animated:has(.type.chords)').length > 0) // Prefers chords over tabs.
                {
                    $2('.line.animated:has(.type.chords)').slice(0,1).each( function (i, elem2)
                    {
                        results.push(
                        {
                            song: $(elem).find('.song.name').text(),
                            band: $(elem).find('.band.name').text(),
                            type: 'Chords',
                            link: $2(elem2).find('a').attr('data-url')
                        });
                    });
                    callback(null);
                }
                else
                {
                    $2('.line.animated:has(.type.guitar)').slice(0,1).each( function (i, elem2)
                    {
                        results.push(
                        {
                            song: $(elem).find('.song.name').text(),
                            band: $(elem).find('.band.name').text(),
                            type: 'Tab',
                            link: $2(elem2).find('a').attr('data-url')
                        });
                    });
                    callback(null);
                }
            });
        },
        function (err)
        {
            if(err) console.log(err);
            cb(results);
        });
    });
}

function search(query, cb)
{
    request // Trae la búsqueda con los parámetros del usuario
    ({
    uri: 'http://www.911tabs.com/search.php',
    method: 'POST',
    form: 
    {
        search: query
    }
    }, 
    function(error, response, body) 
    {
        if (error) return cb(error);
        var results = [];
        var $ = cheerio.load(body);
        if($('.line:has(.song.name)').get(0) == undefined) return cb(results); // Necesario para que no entre a buscar si no tiene nada con get(0) = undefined
        else
        async.forEachOf([$('.line:has(.song.name)').get(0)], function(elem, i, callback)
        {
            request // Verifica que tenga chords o tabs
            ({
            uri: $(elem).find('.song.name').attr('href').replace('_tab.htm','_guitar_tab.htm').split('/').spliced(4,0,'guitar_tabs').spliced(0,1,'http://www.911tabs.com').join('/'),
            method: 'GET'
            },
            function(error, response, body) 
            {
                var $2 = cheerio.load(body);
                if ($2('.line.animated:has(.type.chords)').length > 0) // Prefers chords over tabs.
                {
                    $2('.line.animated:has(.type.chords)').slice(0,1).each( function (i, elem2)
                    {
                        if(supportedPages.contains($2(elem2).find('a').attr('data-url').split('//')[1].split('/')[0])) // Verifica que esté en la lista de páginas soportadas.
                        results.push(
                        {
                            song: $(elem).find('.song.name').text(),
                            band: $(elem).find('.band.name').text(),
                            type: 'Chords',
                            link: $2(elem2).find('a').attr('data-url')
                        });
                    });
                    callback(null);
                }
                else
                {
                    $2('.line.animated:has(.type.guitar)').slice(0,1).each( function (i, elem2)
                    {
                        if(supportedPages.contains($2(elem2).find('a').attr('data-url').split('//')[1].split('/')[0])) // Verifica que esté en la lista de páginas soportadas.
                        results.push(
                        {
                            song: $(elem).find('.song.name').text(),
                            band: $(elem).find('.band.name').text(),
                            type: 'Tab',
                            link: $2(elem2).find('a').attr('data-url')
                        });
                    });
                    callback(null);
                }
            });
        },
        function (err)
        {
            if(err) console.log(err);
            cb(results);
        });
    });
}

function getTab(link, cb)
{
  request // Trae la página con la versión de la canción. 
  ({
    uri: link,
    encoding: 'binary',
    method: "GET"
  },
  function(error, response, body) 
  {
      var $ = cheerio.load(body);
      switch (link.split('//')[1].split('/')[0]) 
      {
            case 'tabs.ultimate-guitar.com':
                return cb(null, $('pre, #cont').next().text().replace(/(\n\r|\r\n|\n|\r)/gm,"\r\n"));
            case 'tablatures.tk':
                return cb(null, $('font, .text').next().text().replace(/(\n\r|\r\n|\n|\r)/gm,"\r\n"));
            case 'www.azchords.com':
                return cb(null, $('pre, #content').next().text().replace(/(\n\r|\r\n|\n|\r)/gm,"\r\n"));
            // case 'www.countrytabs.com':
            //     return cb(null, $('pre, .tabcont').last().text().replace(/(\n\r|\r\n|\n|\r)/gm,"\r\n"));
            //     break;
            case 'www.guitartabs.cc':
                return cb(null, $('pre, .tabcont').last().text().replace(/(\n\r|\r\n|\n|\r)/gm,"\r\n"));
            case 'cifraclub.terra.com.br':
                return cb(null, $('pre, .cifra').text().replace(/(\n\r|\r\n|\n|\r)/gm,"\r\n"));
            case 'www.guitaretab.com':
                return cb(null, $("pre",".monospace").text().replace(/(\n\r|\r\n|\n|\r)/gm,"\r\n"));
            case 'acordes.lacuerda.net':
                return cb(null, $('pre, #t_body').text().replace(/(\n|\r)/gm,"\r\n"));
            default:
                return cb("Error: Couldn't get tab content because "+ link.split('//')[1].split('/')[0] +" is shit.", link);
      }
  });
}

function saveTextToFile(band, song, type, text, cb)
{
    if (text == '') return cb('Error: No se bajó.',null)
    // .pdf version
    var doc = new PDFDocument(), 
        pathpdf = __dirname+'/temp_songs/'+band+' - '+song+'.pdf', 
        stream = fs.createWriteStream(pathpdf); 
    
    doc.pipe(stream); 
    doc.font('./UbuntuMono-R.ttf').fontSize(10).text(song+' by '+band+'\n\n'+text,70,70);
    doc.end(); 
    stream.on('finish', function () { return cb(null, pathpdf); }); 
    
    // // .txt version
    // var path = __dirname+'/temp_songs/'+band+' - '+song+'.txt'; 
    // fs.writeFile(path, text, function (err) 
    // {
    //     if(err) return cb(err, null); 
    //     return cb(null, path);
    // }); 
}

function resultsToInlineSet(results, cb)
{
    var inlineSet = [];
    async.forEachOf(results, function (result, i, cb)
    {
        inlineSet.push(
        {
           type: 'article',
           id: i.toString(),
           title: result.band,
           description: result.song,
           input_message_content: {message_text: '*'+result.band+'* - '+result.song, parse_mode:'Markdown'}
        });
        cb(null);
    }
    , function(err){
        if (err) console.log(err);
        cb(inlineSet);
    });
}

function sendInline(message, inlineSet)
{
    api.answerInlineQuery({inline_query_id: message.id, results: inlineSet}, function (err)
    {
        if (err) console.log(err);
    });
}

function sendChords(message, path)
{
    api.sendDocument({chat_id: message.chat.id, document: path}, function (err)
    {
        if (err) console.log(err);
    });
}

function sendNoResultsMessage(message)
{
    api.sendMessage({chat_id: message.chat.id, text: "Sorry. No results for _"+ message.text +"_.", parse_mode:'Markdown'}, function (err)
    {
        if (err) console.log(err);
    });
}

function saveUser(message)
{
    var filename = (message.from.username!=undefined)?message.from.username:message.chat.first_name+message.chat.last_name;
    jsonfile.writeFile(__dirname+'/usersinfo/'+filename, message.chat, function (err) 
    {
        if (err)console.log(err);
    });
}

function broadcast(text)
{
    fs.readdir(__dirname+'/usersinfo/',function(err, files)
	{
        if(err) return console.log(err);
        for (var i=0; i< files.length;i++)
        {
            jsonfile.readFile(__dirname+'/usersinfo/'+files[i], function(err, obj) 
            {
                if(err) console.log(err);
                else
                {
                    api.sendMessage({chat_id: obj.id, text: text});
                }
            });
        }
    });
}