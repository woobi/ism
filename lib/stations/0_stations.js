/**
Intranet Station Manager
Stations class

*/
const Load = require('./1_load');
const debug = require('debug')('ism:stations:0_stations')
const moment = require('moment');
const _ = require('lodash');
const Promise = require('bluebird');
let jsonfile = require('jsonfile');
let fs = require('fs-extra');
jsonfile = Promise.promisifyAll( jsonfile, { suffix: 'Promise' } );

	module.exports = class Station extends Load {

		constructor ( ) {
			super();
			
			this._available = {
				status: false,
				tuners: false,
				NumberOfTuners: false,
				tune: false,
				untune: false,
				untuneAll: false,
				getConfig: false,
				setConfig: false,
				channels: false,
				refreshChannels: false,
				guideByTime: false,
				guideByChannel: false,
				guideByProgram: false,
				playlist: false
			}
			
			this.port = 20000;
			this.Station = {}
			this.isValid = false;
			this._channels = [];
			this._tuners = {};
			this.name = moment().unix();
			
			this._tunerCheck = {};
			this.tuneManager = setInterval( ( ) => {
				// check the tuners collection for tuned and owned
				_.forEach( this.Station._tuners, ( tuner, key ) => {
					
					if ( tuner.channel != 0 && tuner.owned === true ) {
						// see if we have a streamer for this tuner
						// debug('tuner', tuner.owned, tuner.channel, tuner.id)
						let streamer = _.reduce( this.ism.streaming, ( sum, value ) => {
							//debug( value, tuner.id );
							value.forEach( v => {
								if ( v.id === tuner.id ) {
									sum++;
								}
							})
							
							return sum;
						}, 0);
						if ( streamer === 0 ) {
							//  we are tuned to a channel than may be orphaned
							// check _tunerCheck to see if we know about it
							// if not add it to _tunerCheck for a 1 minute wait period before we kill it
							const then = moment().subtract( 1, 'm' ).unix();
							if ( this._tunerCheck[ tuner.id ] ) {
								// check tht timer
								if ( this._tunerCheck[ tuner.id ] < then ) {
									// orphan so untune
									debug( 'untune', tuner.id );
									this.Station.untune( tuner.id )
									.then( () => {
										debug('delete _tunerCheck entry');
										delete this._tunerCheck[ tuner.id ];
									}).catch(debug);
								}
							} else {
								this._tunerCheck[tuner.id] = moment().unix();
							}
						}
					}
				});
			}, 15000 );
			
			return this;
		}
		
		get _getStationPortForWoobi ( ) {
			const p = this.port;
			this.port += 1;
			return p;
		}
		
		status ( ) {
			return this.valid()
			.then( station => {
				return this.Station.status()
			})
			.then ( status => {
				return {
					...status,
					valid: this.isValid,
					clients: this._clients,
				}
			});
		}
		
		get channels ( ) {
			let channels = this.Station.channels;
			return channels;
			
		}
		
		tune ( { tune, delivery = false, force = false, seriouslyForce = false } ) {
			
			// see if the channel is tuned
			let tuned;
			let available;
			 _.forEach( this.Station._tuners, ( tuner, key ) => {
				if ( tuned ) return;
				debug('tuned', tuner.owned, tuner.tune, tune)
				if ( tuner.channel == tune && tuner.owned === true ) tuned = this.Station._tuners[key];
				if ( tuner.channel === 0 ) available = this.Station._tuners[key];
			});
			
			debug( !!available, !!tuned );
			if ( tuned ) {
				debug('tuned prev' );
				delete this._tunerCheck[ tuned.id ];
				// we already have this channel playing so tune into that broadcast
				return Promise.resolve( {
					tuner: tuned.id,
					link: tuned.link,
					path: tuned.path,
					smb: tuned.smb
				})
				
			} else if ( available ) {
				// tune the channel
				
				const options = {
					tune
				}
				return this.Station.tune( options )
				.then( tuner => {
					//debug(tuner)
					delete this._tunerCheck[ tuner.id ];
					let t = tuner;
					t.tune = tune;
					t.tuned = true;
					t.owned = true;
					debug(' tuned available', t.id);
					return {
						tuner: t.id,
						link: t.link,
						path: t.path,
						smb: t.smb
					};
				}) 
			} else {
				return Promise.reject({
					success: false,
					code: 501,
					message: 'No Available Tuners'
				})
			}
		}
		
		guideByTime ( start, end ) {
		
		}
		
		guideByChannel ( channel, hours ) {
		
		}
		
		guideByProgram ( program, hours ) {
		
		}
		
		refreshChannels ( ) {
			
		}
		
		valid ( ) {
			if ( this.isValid ) {
				return Promise.resolve( this );
			} else {
				return this._valid( );
			}
		}
		
		_valid ( ) {
			if ( !_.isFunction( this.Station.status ) ) {
				return Promise.reject( {
					success: false,
					code: 404,
					message: 'A valid station plugin must be supplied'
				} ); 
			}
			// run a check for required functions
			return this.checkConfig( )
			then( ( ) => {
				debug(' Is Valid ', true );
				return this;
			})
			.catch( errors => {
				return {
					success: false,
					code: 501,
					message: errors.join(', ')
				}
			});
		}
		
		setStatus( tuners ) {
			return Promise.resolve( this )
		} 
		
		get _gabOn ( ) {
			return {
				"gabTalk": {
					"status": "station:" + this.name + ":status",
					"tune": "station:" + this.name + ":tune",
					"untune": "station:" + this.name + ":untune",
					"untuneAll": "station:" + this.name + ":untuneAll",
					"channels": "station:" + this.name + ":channels",
					"epg": "station:" + this.name + ":epg"
				},
				"gabListen": {
					"setConfig": "ism:" + this.name + ":setConfig",
					"getConfig": "ism:" + this.name + ":getConfig",
					"status": "ism:" + this.name + ":status",
					"tune": "ism:" + this.name + ":tune",
					"untune": "ism:" + this.name + ":untune",
					"channels": "ism:" + this.name + ":channels",
					"epg": "ism:" + this.name + ":epg",
					"untuneAll": "ism:" + this.name + ":untuneAll"
				},
			}
		}
		
		checkConfig ( ) {
			return new Promise ( ( resolve, reject ) => {
				let errors = [];
				
				const config = this.Station;
				
				if ( config.tuners ) {
					this._available.tuners = true;
				} 
				
				if ( config.NumberOfTuners ) {
					this._available.NumberOfTuners = true;
				} 
				
				if ( !_.isFunction( config.tune ) ) {
					errors.push('A tune function must be supplied');
				} else this._available.tune = true;
				
				if ( !_.isFunction( config.untune ) ) {
					errors.push('A untune function must be supplied');
				} else this._available.untune = true;
				
				if ( _.isFunction(config.untuneAll) ) {
					this._available.untuneAll = true;
				} 
				
				if ( !_.isFunction(config.getConfig) ) {
					errors.push('A getConfig function must be supplied');
				} else this._available.getConfig = true;
				
				if ( !_.isFunction(config.setConfig) ) {
					errors.push('A setConfig function must be supplied');
				} else this._available.setConfig = true;
				
				if ( !_.isFunction(config.refreshChannels) ) {
					errors.push('A refreshChannels function must be supplied');
				} else this._available.refreshChannels = true;
				
				if ( !_.isFunction(config.status) ) {
					errors.push('A status function must be supplied');
				} else this._available.status = true;
				
				if ( _.isFunction(config.guideByTime) ) {
					this._available.guideByTime = true;
				} 
				
				if ( _.isFunction(config.guideByChannel) ) {
					this._available.guideByChannel = true;
				} 
				
				if ( _.isFunction(config.guideByProgram) ) {
					this._available.guideByProgram = true;
				} 
				
				if ( _.isFunction(config.playlist) ) {
					this._available.playlist = true;
				} 
				
				if ( !_.isObject(config.channels) ) {
					errors.push('An Object of channels must be provided');
				} else {
					if ( Object.keys( config.channels ) < 1 ) {
						errors.push('There must be at least 1 channel supplied');
					} else this._available.channels = true;
				}
								
				if ( errors.length > 0 ) {
					reject( errors );
				} else {
					this.isValid = true;
					resolve( this );
				}
			}); // end Promise 
		}
		
	}
