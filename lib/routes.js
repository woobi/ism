/**
 * proxy route.
 *
 * @param {Instance} app
 * @param {Instance} ISM
 * @api private
 */
 
var debug = require('debug')('ism:routes');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var mime = require('mime/lite');
var Leaky = require('woobi/lib/node-streams/leaky');
var tailing = require('tail-stream');

module.exports = function ( ISM ) {
	let root = ISM._config.api || 'ism';
	let count = 0;
	return function ( app ) {
		// test session
		app.get(path.join( '/', root, '/test' ), ( req, res ) => {
			debug( req.session )
			if ( !req.session.count ) req.session.count = 0
			res.writeHead(200, {'Content-Type': mime.getType('json')});
			res.write(JSON.stringify({
			  "count": req.session.count++
			}));
			res.end();
		})
		
		app.get(path.join( '/', root, '/:station/playlist' ), ( req, res ) => {
			debug( req.params )
			ISM.playlist( req.params.station )
			.then( list => {
				res.writeHead(200, {'Content-Type': 'application/vnd.apple.mpegurl'});
				res.write(list);
				res.end();
			});
		})
		
		/* serve the smb path file */
		app.get(path.join( '/', root, '/:station/:channel/smb' ), ( req, res ) => {
			if ( !req.headers.range ) {
				// 416 Wrong range
				return res.sendStatus(416);
				
			} else if ( req.params.channel ) {
				debug(req.params.station, req.params.channel)
				ISM.tune( req.params.station, req.params.channel )
				.then( ret => {
					debug('tune from route', ret);
					if ( ret.smb ) {
						res.send( { smb: ret.smb } );
						//res.redirect(ret.link);
					}
				})
				.catch( e => {
					return res.sendStatus(404);
				});
				
			} else {
				return res.sendStatus(404);
			}
		})
		
		/* serves main seekable stream */
		app.get([ path.join( '/', root, "/:station/:channel"), path.join( '/', root, '/:station/:channel/play.*')], function( req, res ) {
			
			debug('Headers Received', req.headers);
			
			if ( !req.headers.range ) {
				// 416 Wrong range
				return res.sendStatus(416);
			}
			
			let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
						
			if ( !ISM.streaming[ip] ) {
				ISM.streaming[ip] = [];
			}
			
			let found;
			if ( ISM.streaming[ip] ) {
				// requesting same channel so send chached link
				found = _.find( ISM.streaming[ip], [ 'channel', req.params.channel]);
				if ( found ) {
					debug( 'serve a tuned link' );
					let tuner = ISM.stations[req.params.station].Station._tuners[found.id];
					serveFile( found.path, found, req, res, tuner );
					return;
				}
			}
			
			if ( req.params.channel ) {
				debug('Get channel ', req.params.station, req.params.channel)
				ISM.tune( req.params.station, req.params.channel )
				.then( ret => {
					debug('tune from route', ret);
					if ( ret ) {
						let tuner = ISM.stations[req.params.station].Station._tuners[ret.tuner];
						ISM.Broadcast.once( tuner.Channel.out.name , ( data ) => {
							serveFile( tuner.path, tuner, req, res, tuner );
						})
					}
					return;
				})
				.catch( e => {
					debug('tune error', e);
					return res.sendStatus(404);
				});
			} else {
				debug('no channel', e);
				return res.sendStatus(404);
			}
		})
		
		function serveFile( file, ret, req, res, tuner ) {			
			
			let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;			
			let isVLC = req.headers['user-agent'].search(/vlc/i) > -1;
			
			// the out file class has all the info we would normally get from stat so use it
			tuner.Channel.out.info()
			.then( info => {

				const range = req.headers.range;

				let positions = range.replace(/bytes=/, "").split("-");
				let total = info.size; // use the most current size
				let start = req.query.start ? Number(req.query.start) : parseInt(positions[0], 10);
				let end = positions[1] ? parseInt(positions[1], 10) : total - 1;
				
				if ( !req.query.start && ( start > info.size || ( ret.size && ( start === 0 && info.size > 1000000 ) ) ) ) {
					debug('jump start to end', )
					start = info.size;
					end = total; //info.size + ( isVLC ? 23000000 : 9000000 );
				}
				
				let chunksize = (end - start) + 1;
				
				let headers = {
					"Content-Range": "bytes " + start + "-" + end + "/" + total,
					"Accept-Ranges": "bytes",
					//"Content-Length": total,
					"Content-Type": mime.getType( file ),
					  //'cache-control': 'no-cache',
					 // pragma: 'no-cache',
					  //'transfermode.dlna.org': 'Streaming',
				}
				
				if ( req.query.norange == 'true' ) {
					headers = {
						"Content-Type": mime.getType( file ),
						//'cache-control': 'no-cache',
						//pragma: 'no-cache',
						'transfermode.dlna.org': 'Streaming',
					}
				}
				
				debug(headers, ISM.streaming[ip].length);
				
				// send the dvr file as a stream
				/*
				var GrowingFile = ts.createReadStream( file, {
					beginAt: start,
					//onMove: 'stay',
					detectTruncate: false,
					//onTruncate: 'reset',
					endOnError: false
				}); */
				var GrowingFile = new ISM.Broadcast.Source.GrowingFile( { file, start: start } )
				GrowingFile.once("open", function() {
					// add client
					debug( 'Add client' );
					ISM.untune( req.params.channel, ip )
					.then( () => {
						debug('add to streamers');
						ISM.streaming[ip].push({
							...ret,
							...info,
							channel: req.params.channel,
							SIZE: Number( (info.size / 1000000) ).toFixed(2) + 'MB'
						});
					}).catch(debug);

					res.writeHead(206, headers);
					
					//GrowingFile.stream.pipe(res);
					
				});
				
				GrowingFile.stream.on("data", data => {
					res.write(data)
				});
				
				// listen for res close toe nd the growing file
				res.on("close", function(err) {
					//ISM.untune( req.params.station, tuner.id, ip ).catch(debug);
					debug( 'end growing file' );
					GrowingFile.end();
					//ISM.untune( req.params.channel, ip ).catch(debug);
				});
				req.on("close", function(err) {
					//ISM.untune( req.params.channel, ip ).catch(debug);
					debug( 'close timeout' );
				});
				req.on("end", function(err) {
					//ISM.untune( req.params.channel, ip ).catch(debug);
					debug( 'end timeout' );
				});
				req.on("error", function(err) {
					debug( 'error timeout' );
					//ISM.untune( req.params.channel, ip ).catch(debug);
				});
				
			})
			.catch( e => {
				debug( e );
				return res.sendStatus(501);
			});
		}
	}
}
