/**
Intranet Station Manager
originating class

*/
const debug = require('debug')('ism')
let Station = require('./stations');
let Routes = require('./routes');
const Promise = require('bluebird');
const Woobi = require('woobi');
var _ = require('lodash');
const EventEmitter = require('./emitter');
const path = require('path');
let jsonfile = require('jsonfile');
let fs = require('fs-extra');
jsonfile = Promise.promisifyAll( jsonfile, { suffix: 'Promise' } );

const moduleRoot = (function(_rootPath) {
	let parts = _rootPath.split(path.sep);
	parts.pop()
	//parts.splice(-2, 2); //get rid of /node_modules from the end of the path
	return parts.join(path.sep);
})(module.paths[1]);

const ISM = class ISM {

    constructor ( ) {
        
        this.moduleRoot = moduleRoot;
        this.dvrPath = path.join( moduleRoot, 'media', 'dvr' );
        // the streaming cache keeps up with what we are piping 
        this.streaming = {};
        
        this.stations = {}; // each station is stored by its generated id
        
        this.Gab = new EventEmitter();
        
        this._port = 13000;
		
    }
    
    get port ( ) {
		const p = this._port;
		this._port += 200;
		return p;
	}
	
	get channels ( ) {
		let chans = [];
		Object.keys(this.stations).forEach( k => {
			const station = this.stations[k];
			chans.push( station.channels )
		}); 
		
		return this.output().channels(chans);
	}
	
	output ( station ) {
		const s = this.stations[ station ];
		debug('output', station )
		return s._output || this._output;
	}
	
	init ( config ) {       
        // load the config from file
        const file = config ? config : path.join( this.moduleRoot, 'conf', 'ism.json' );
		return fs.stat(file)
		.then( stats => {
			return jsonfile.readFilePromise( file );
		})
		.then( cfg => this.cfg( cfg ) )
		.then( () => this )
		.catch(debug)
	}
	
	cfg ( cfg ) {
		if( !cfg.output ) {
			return Promise.reject({
				success: false,
				code: 404,
				message: 'An output plugin must be supplied'
			});
		}
		this._config = cfg;
		 // Woobi takes care of our sinks and streams
        this.Broadcast = new Woobi();
        if ( cfg.Woobi.proxy ) {
			cfg.Woobi.proxy.routes = Routes(this);
		}
        return this.Broadcast.init( cfg.Woobi )
        .then( woobi => this.loadOutput( cfg.output ) )
        .then( output => {
			this._output = output;
			return this;
		})
        .then( ism => this.addStations( cfg.stations ) )
		.then( stations => this.addPlugins( cfg.plugins ) );		
	}
	
	loadOutput ( output ) {       
		// see if the module exists
		//debug('load output', output );
		let GetOutput;
		try {
			GetOutput = require( output );
		} catch ( e ) {
			debug( 'Failed to get ism output module', e, output );
		}
		if( GetOutput ) {
			//debug('loaded ouput', addTo.tune);
			return Promise.resolve( new GetOutput() );
		} else {
			return Promise.reject( {
				success: false,
				code: 404,
				message: 'Failed to load output module ' + output 
			});
		}
	}
	
    status () {
        
    }
    
    addPlugins ( config ) {
		return Promise.resolve( true );
    }
    
    addStations ( stations ) {
		let p = []; // promises array
		if ( Array.isArray( stations ) ) {
			stations.forEach(s => {
				p.push( this.addStation( s ) );
			});
			
			return Promise.all(p)
			.then( ( ) => {
				debug('Stations Added');
			});
			
		} else {
			return Promise.reject( 404 );
		}
		
    }
    
    addStation ( station ) {
		if ( typeof station === 'string' ) {
			station = {
				plugin: station,
				config: {}
			}
		}
		let ss = this.stations[station.plugin] = new Station( this );
		return ss.load( { station: station.plugin, config: station.config, port: this.port } )
		.then( Station => {
			// if we have an output load it else use the main output
			if ( !station.output ) {
				debug('use this output', this._output)
				ss.output = this._output;
				return ss;
			} else {
				// try and load an output module
				debug('load an output', station.output);
				return this.loadOutput( station.output )
				.then( output => {
					ss._output = output;
					return ss;
				})
			}
		})
		.catch( e => {
			debug( e );
			// failed to load station
			this.stations[station.plugin] = {};
			return this.stations[station.plugin];
		});
		
    }
    
    removeStation ( station ) {
		return Promise.resolve( true );
    }
    
    useStation ( station ) {
		return Promise.resolve( true );
    }
    
    listStations ( ) {
		return Promise.resolve( true );
    }
    
    tune ( stationString, tune ) {
		const station = this.stations[stationString];
		const output = this.output( stationString );
		//debug('output', output, this.stations[stationString], tune)
		
		if ( station.tune ) {
			return station.tune( { tune } )
			.then( tuned => {
				debug('station.tune ', tuned);
				return output.tune( tuned ) 
			})
			.catch(debug)
		} else {
			Promise.reject(501)
		}
	}
 
	untune ( channel, ip ) {
		_.remove( this.streaming[ip], [ 'channel', channel ]);
		return Promise.resolve(true);
	}
		
	playlist( stationString ) {
		let station = this.stations[stationString];
		//debug( station.channels )
		if ( station._output.playlist ) {
			return station._output.playlist( stationString, station.channels );
		} else {
			return this._output.playlist( stationString, station.channels );
		}
	}
	
	notify ( event, data ) {
		this.gab.emit( event, data );
	}
    
}


module.exports = ISM;
