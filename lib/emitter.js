const EventEmitter = require('events');

class Emitter extends EventEmitter {
	 constructor() {
        super();
    }
}

class Notify {
	 constructor() {        
        this.gab = new EventEmitter();
        this.io = false;
    }
    
    emit ( event, fn ) {
		this.gab.emit( event, fn );
	}
	
	on ( event, fn ) {
		this.gab.on( event, fn );
	}
	
	once ( event, fn ) {
		this.gab.once( event, fn );
	}
	
	removeListener ( event, fn ) {
		this.gab.removeListener( event, fn );
	}
	
	removeAllListeners ( event ) {
		this.gab.removeAllListeners( event );
	}
	
	addListener ( event, fn ) {
		this.on( event, fn );
	}
	
	add ( event, fn ) {
		this.on( event, fn );
	}
	
	remove ( event, fn ) {
		this.removeListener( event, fn );
	}
	
	removeAll ( event ) {
		this.removeAllListeners( event );
	}
	
	removeListeners ( event ) {
		this.removeAllListeners( event );
	}	
    
}

module.exports = Notify
