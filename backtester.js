
var market = function(balance, leverage, onTick) {
	this.balance			= balance;
	this.leverage			= leverage;
	this.positions			= [];
	this.marginCallLevel	= 0.9;	// If a position takes more than 90% of your available balance, call it.
	this.onTick             = onTick||function() {};
};
// Open a BUY position
market.prototype.buy = function(size, price, n, options) {
    options = _.extend({
        tp: false,
        sl: false
    }, options);
    
	// Create the position
	var position = {
		size:		size,
		levSize:	size*this.leverage,
		lots:       (size*this.leverage)/price,
		type:		'buy',
		open:		price,
		close:		false,
		start:		n,
		end:		false,
		tp:         options.tp,
		sl:         options.sl
	}
	
	// Can we take this position?
	if (position.size >= this.balance) {
		console.log("Not enough balance to buy", position);
		return false;
	}
	
	// Debit from the balance
	this.balance = this.balance-position.size;
	
	// Save
	this.positions.push(position);
	
	return position;
}
// Open a SELL position
market.prototype.sell = function(size, price, n, options) {
    options = _.extend({
        tp: false,
        sl: false
    }, options);
    
    console.log("SELL", {
        size:size, 
        price:price, 
        n:n, 
        options:options
    });
    
	// Create the position
	var position = {
		size:		size,
		levSize:	size*this.leverage,
		lots:       (size*this.leverage)/price,
		type:		'sell',
		open:		price,
		close:		false,
		start:		n,
		end:		false,
		tp:         options.tp,
		sl:         options.sl
	}
	
	console.log("position", position);
	
	//console.log("Balance: $"+this.balance.toFixed(2)+", Purchasing: ", position.size);
	
	// Can we take this position?
	if (position.size >= this.balance) {
		console.log("Not enough balance to buy", position);
		return false;
	}
	
	// Debit from the balance
	this.balance = this.balance-position.size;
	//console.log("New balance: ", this.balance);
	
	// Save
	this.positions.push(position);
	
	return position;
}
// Close a position
market.prototype.close = function(position, price, n) {
    //console.log("CLOSE");
    //console.log(position);
	// Calculate the profit, update the position
	position.close	= price;
	position.end	= n;
	position.delta	= position.close-position.open;
	position.profit = this.getUnrealizedPL(position, price);
	
	position.pl		= position.size+position.profit;
	// Update the balance
	this.balance	= this.balance+position.pl;
}
// Get the unrealized Profit/Loss of a position
market.prototype.getUnrealizedPL = function(position, price) {
    if (position.type=='buy') {
	    var delta	= price-position.open;
    } else {
        var delta	= position.open-price;
    }
	var pl		= delta*position.lots;
	return pl;
}
// Get the position size based on a percentage of your available balance
market.prototype.getPositionSize = function(percent) {
	var baseValue	= this.balance*percent/100;
	return baseValue;
}
// Get the current unrealized PL accross all open positions
market.prototype.getAllgetUnrealizedPL = function(currentPrice) {
	var scope	= this;
	var totalPL	= 0;
	// Find all the open positions
	_.each(this.positions, function(position) {
		if (position.close===false) {
			// That position is still opened
			var pl	= scope.getUnrealizedPL(position, currentPrice);
			totalPL += position.size+pl;
		}
	});
	return totalPL;
}
// Tick: Close positions that need to be closed (SL/TP), margin call, etc
market.prototype.tick = function(currentPrice, high, low, n) {
	var scope	= this;
	
	// Margin call check
	_.each(this.positions, function(position) {
		if (position.close===false) {
			// That position is still open
			var pl	= position.size+scope.getUnrealizedPL(position, currentPrice);
			if (pl*-1 >= scope.balance*scope.marginCallLevel) {
			    // Position's loss is grater than the margin call limit, gonna have to abort that
			    console.log("MARGIN CALL:", pl*-1, position);
				scope.close(position, currentPrice, n);
			} else if (scope.onTick) {
			    // Position ongoing
			    // SL or TP?
			    if (position.type=='buy') {
			        // BUY
    			    if (position.tp && currentPrice>=position.tp) {
    			        // Take Profit! :)
    			        //console.log("Take Profit!", currentPrice, "->", position.tp);
    			        scope.close(position, currentPrice, n);
    			    } else if (position.sl && currentPrice<=position.sl) {
    			        // Stop Loss :(
    			        //console.log("Stop Loss!", currentPrice, "->", position.sl);
    			        scope.close(position, currentPrice, n);
    			    } else {
        			    // Update the position before passing it
        			    position.unrealizedPL   = pl;
        			    // Call the onTick callback
            		    scope.onTick(position, n)
    			    }
			    } else {
			        // SELL
			        if (position.start==836) {
			            console.log("position 836", position.tp, low, low<=position.tp);
			            
			        }
			        if (position.tp && low<=position.tp) {
    			        // Take Profit! :)
    			        //console.log("Take Profit!", currentPrice, "->", position.tp);
    			        scope.close(position, position.tp, n);
    			    } else if (position.sl && high>=position.sl) {
    			        // Stop Loss :(
    			        //console.log("Stop Loss!", currentPrice, "->", position.sl);
    			        scope.close(position, position.sl, n);
    			    } else {
        			    // Update the position before passing it
        			    position.unrealizedPL   = pl;
        			    // Call the onTick callback
            		    scope.onTick(position, n)
    			    }
			    }
    		}
		}
	});
	
	// stats
	var unrealizedPL = this.getAllgetUnrealizedPL(currentPrice)
	var stats = {
		balance:		this.balance,
		unrealizedPL:	unrealizedPL,
		accountValue:	this.balance+unrealizedPL,
		positions:		this.positions.length,
		winCount:		0,
		winValue:		0,
		lossCount:		0,
		lossValue:		0,
		openCount:		0,
		openValue:		0,
		winRatio:		0
	}
	
	_.each(this.positions, function(position) {
		if (position.profit && position.profit > 0) {
			// Winning position
			stats.winValue	+= position.profit;
			stats.winCount++;
		} else if (position.profit && position.profit <= 0) {
			// Losing position
			stats.lossValue	+= position.profit;
			stats.lossCount++;
		} else if (!position.close) {
			// Open position
			stats.openValue	+= scope.getUnrealizedPL(position, currentPrice);
			stats.openCount++;
		} 
	});
	
	stats.winRatio	= stats.winCount+stats.lossCount>0?stats.winCount/(stats.winCount+stats.lossCount):0;
	
	return stats;
}



var sim = new market(options.input.startBalance, options.input.leverage, function(position, n) {
    
});