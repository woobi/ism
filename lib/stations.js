/**
Intranet Station Manager
Stations class

*/
const debug = require('debug')('ism:stations')
const Stations = require('./stations/0_stations');

module.exports = class Station extends Stations {
	constructor ( ism ) {
		super();
		
		this.ism = ism;
					
		return this;
	}
}
