/**
Intranet Station Manager
Stations class

*/
const debug = require('debug')('ism:lib:stations')
const moment = require('moment');
const _ = require('lodash');
const Promise = require('bluebird');
let jsonfile = require('jsonfile');
let fs = require('fs-extra');
jsonfile = Promise.promisifyAll( jsonfile, { suffix: 'Promise' } );

	module.exports = class Station {

		constructor ( ism ) {
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
			
			this.ism = ism;
			
			this.port = 20000;
			this.Station = {}
			this.isValid = false;
			this.clients = [];
			this.channels = [];
			this.tuners = {};
			this.name = moment().unix();
			
			
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
					clients: this.clients,
				}
			});
		}
		
		tune ( { channel, delivery = 'http', force = false, seriouslyForce = false } ) {
			
			// see if the channel is tuned
			let tuned = _.find( this.tuners, [ 'owned', true, 'channel', channel ] );
			let available = _.find( this.tuners, [ 'tuned', false ] );
			if ( tuned ) {
				debug('tuned prev', tuned );
				// we already have this channel playing so tune into that broadcast
				return Promise.resolve( {
					tuner: tuned.id,
					link: tuned.link
				})
				
			} else if ( available ) {
				// tune the channel
				const tune = {
					channel, 
					delivery:  {
						udp: available.via.udp,
						http: available.via.http
					}
				}
				return this.Station.tune( tune )
				.then( station => {
					available.channel = channel;
					available.tuned = true;
					available.owned = true;
					debug(' tuned');
					return {
						tuner: available.id,
						link: available.link
					}
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
			let p = [];
			if ( Array.isArray( tuners.available ) ) {
				tuners.available.forEach( t => {
					this.tuners[t.id] = {
						...this.tuners[t.id],
						...t,
						tuned: false,
						owned: false
					}
				});
			}
			if ( Array.isArray( tuners.tuned ) ) {
				tuners.tuned.forEach( t => {
					this.tuners[t.id] = {
						...this.tuners[t.id],
						...t,
						tuned: true,
					}
					p.push( t.channel )
				});
			}
			this.channels = p;
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
