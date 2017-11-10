/**
Intranet Station Manager
Stations load class

*/
const debug = require('debug')('ism:stations:1_load')
const moment = require('moment');
const _ = require('lodash');
const path = require('path');
const Promise = require('bluebird');
let jsonfile = require('jsonfile');
let fs = require('fs-extra');
jsonfile = Promise.promisifyAll( jsonfile, { suffix: 'Promise' } );

module.exports =  class Load {
		constructor ( ) {
			//super();
		}
		
		loadConfig ( name, type = 'stations' ) {
			const file = path.join( this.ism.moduleRoot, 'conf', type, name + '.json' );
			debug( 'load config', file );
			return fs.stat(file)
			.then( stats => jsonfile.readFilePromise( file ) )
			.catch( (e) => {
				debug('Eror from jsonfile', e);
				return {}
			});
		}
		
		load ( { station, config, port } ) {
			return new Promise( ( resolve, reject ) => {
				if ( !_.isString(station) ) {
					return reject( {
						success: false,
						code: 404,
						message: 'A station plugin must be supplied'
					} );
				}
				
				// see if the module exists
				let GetStation;
				try {
					GetStation = require(station);
				} catch ( e ) {
					debug( 'Failed to get station plugin module' );
					return reject( {
						success: false,
						code: 404,
						message: e.message
					});
				}
				
				// create the station
				this.Station = new GetStation();
				// generate the config file
				this.getConfig( config, station )
				.then( config => {
					if ( !config.name ) {
						config.name = moment().unix();
					}
					this.name = config.name;
					this.port = port;
					config = { 
						...config,
						...this._gabOn,
						gab: this.ism.Gab
					};
					// run this now so the catch will trigger a default coonfiguration on failure
					return this.Station.init( config )
					.catch( e => {
						// try a default install.  the config can be added later
						return this.Station.init( { } ) 
						.catch( e => {
							debug(e);
							reject( {
								success: false,
								code: 501,
								message: e.message
							} );
						});
					})
				})
				// get the requested config options from the station
				.then( station => station.getConfig( ) )
				.then( cfg => {
					this.acceptedDelivery = cfg.acceptedDelivery;
					this.delivery = cfg.delivery;
					// see if the tuner is valid and ready to use
					return this.valid()
				})
				// valid tuner so set a status listener
				.then( () => {
					this.ism.Gab.on( this._gabOn.gabTalk.status, this.setStatus.bind(this) );
					return this.Station;
				})
				// grab the tuners and set them up
				.then( station => station.tuners )
				.then( tuners => {
					return this.setStatus( tuners )
				})
				// add a woobi channel to deliver the stream
				.then( tuners => {
					let p = []
					// each tuner gets a channel stream
					_.each( this.Station._tuners, ( tuner ) => {
						p.push( this._createChannel( tuner ) );
					});
					return Promise.all( p )
				})
				.then( () => {
					// we are done
					resolve( this );
				})
				.catch( e => {
					// well damn, we need a haapy error message generator
					debug(e);
					reject( {
						success: false,
						code: 501,
						message: e.message
					} );
				});
			});
		}
		
		getConfig( config, station ) {
			//debug( station, config );
			return this.loadConfig( station )
			.then( cfg => ( { ...cfg, ...config } ) )
			.then( obj => {
				// check for REQUIRED and try and add it to the object
				debug( 'any REQUIRED', !!obj.REQUIRED );
				if ( _.isObject( obj.REQUIRED ) ) {
					_.each( obj.REQUIRED, ( v, k ) => {
						// see if the module exists
						let GetRed;
						try {
							GetRed = require(v);
						} catch ( e ) {
							debug( 'Failed to get station plugin module' );
							GetRed = false
						}
						if ( GetRed ) {
							obj[k] = GetRed( this );
						}
					});
				}
				return obj; 
			})
		}
		
		_createChannel ( tuner ) {
			tuner.port = this._getStationPortForWoobi;
			this.ism.Broadcast.channels[tuner.id] = false; 
			this.ism.Broadcast.addChannel( tuner.id, {
				loop: false,
				noTransition: true,
				out: {
					file: path.join(this.ism.dvrPath, tuner.id, tuner.id + '.ts'),
					maxLength: false, // in seconds
				},
				tuner: tuner.id,
				mpegts: true,
				dvrPath: path.join( this.ism.dvrPath, tuner.id ),
				// hdhomerun will send us a stream here
				assets: [
					{
						type: 'udpSink',
						port: tuner.port,
						host: '10.2.2.12',
						name: tuner.id + '-sink',
						playSource: false,
					}
				],
			})
			.then( channel => {
				tuner.Channel = channel;
				tuner.via = {
					udp: ( ) => {
						let sink = channel.getAsset( 'udpSinks', tuner.id + '-sink');
						channel.force( sink, true );
						return sink.link;
					},
					http: ( req ) => {
						return channel.helpers.request( req )
						.then( res => {
							debug(' play new source')
							channel.play();
							return res;
						});
					},
					ffmpeg: ( link, callback ) => {
						channel.addSource({
							file: link,
							mpegts: true,
							name: tuner.id,
						}, () => {
							debug(' play new source')
							channel.play();
							if ( callback ) {
								callback();
							}
						});
					}
				}
				tuner.link = channel.links.http;
				tuner.path = channel.links.dvrPath;
				tuner.clients = [];
				tuner.smb = path.join(this.ism._config.smb, tuner.id, tuner.id + '.ts');
				return tuner;
			}).catch(debug);
		}
			
	}
