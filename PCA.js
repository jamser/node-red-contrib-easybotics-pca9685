var i2cBus = require("i2c-bus");
var Pca9685Driver = require("pca9685").Pca9685Driver;
 

//function normalizer (data, inMin, inMax, outMin, outMax
//
function normal (data, inMin, inMax, outMin, outMax)
{
	return ( ((data - inMin) / (inMax - inMin)) * (outMax - outMin)) + outMin
}

function intraPol (min, max, current)
{
	this.min = min
	this.max = max
	this.current = current; 

	this.start		= undefined
	this.goal		= undefined
	this.startTime	= undefined
	this.endTime	= undefined

	this.drive = function (time)
	{
		if(time >= this.endTime)
		{
			this.current = this.goal
			return true;
		}

		this.current = normal(time, this.startTime, this.endTime, this.start, this.goal )
		return false
	}

	this.move  = function(time, goal, duration)
	{
		this.start = this.current
		this.goal  = goal;
		this.startTime = time
		this.endTime = time + duration
	}
}


function motor (pwm, in1, in2)
{
	this.pwmPin = pwm
	this.in1Pin = in1
	this.in2Pin = in2
	this.direction = undefined

	this.drive = function (speed, driver)
	{
		if(speed > 100)  speed = 100;
		if(speed < -100) speed = -100;

		if(speed >= 0 && !this.direction)
		{
			driver.setPulseRange(this.in1Pin, 0, 4095)
			driver.setPulseRange(this.in2Pin, 4095, 0)
			this.direction = true
		}
		if(speed < 0 && this.direction)
		{
			driver.setPulseRange(this.in2Pin, 0, 4095)
			driver.setPulseRange(this.in1Pin, 4095, 0)
			this.direction = false
		}

		driver.setPulseRange(this.pwmPin, 0, 40 * Math.abs(speed))
	}
}

function DCControl (pwm, in1, in2)
{
	this.motor = new motor(pwm, in1, in2)
	this.poll  = new intraPol(-100, 100, 0)

	this.update = function (time, driver)
	{
		this.poll.drive(time)
		this.motor.drive(this.poll.current, driver)
	}

	this.setSpeed = function(speed)
	{
		const time = (new Date).getTime()
		this.poll.move(time, speed, 500)
	}
}

function PCADad (config)
{
	const node = this;
	node.pollRegister = new Set();
	node.end = false; 
	node.start = false;
	
	this.update = function ()
	{
		if(node.end) return; 

		if(node.start)
		{
			for(const n of node.pollRegister)
			{
				const time = (new Date).getTime()
				n.update(time, node.pwm)
			}
		}

		setTimeout(node.update, 300)

	}

	this.register = function (p)
	{
		node.pollRegister.add(p)
	}

	this.unRegister = function (p)
	{
		node.pollRegister.remove(p)
	}

	const options = 
	{
		i2c: i2cBus.openSync(1), 
		address: 0x6f, //settable
		frequency: 1600, 
		debug: false
	};

	this.pwm = new Pca9685Driver(options, function (err)
	{
		if(err) 
		{
			console.error("Error initing PCA9685")
			console.error(err)
			return;
		}
		console.error("inited pca")
		node.start = true;
		node.update();
	});

}

module.exports = function (RED)
{
	var oneHandle = false; 

	function PCAHandle (config)
	{
		const node = this;
		node.pollRegister = new Set();
		node.end = false; 
		node.start = false;
		
		this.update = function ()
		{
			if(node.end) return; 

			if(node.start)
			{
				for(const n of node.pollRegister)
				{
					const time = (new Date).getTime()
					n.update(time, node.pwm)
				}
			}

			setTimeout(node.update, 300)

		}

		this.register = function (p)
		{
			node.pollRegister.add(p)
		}

		this.unRegister = function (p)
		{
			node.pollRegister.remove(p)
		}

		const options = 
		{
			i2c: i2cBus.openSync(1), 
			address: 0x6f, //settable
			frequency: 1600, 
			debug: false
		};

		this.pwm = new Pca9685Driver(options, function (err)
		{
			if(err) 
			{
				console.error("Error initing PCA9685")
				console.error(err)
				return;
			}
			console.error("inited pca")
			node.start = true;
			node.update();
		});
	}

	function DCMotor (config)
	{
		RED.nodes.createNode(this, config)
		const node = this 

		node.handle = RED.nodes.getNode(config.handle)
		node.pwmPin = config.pwm 
		node.left   = config.left
		node.right  = config.right 

		node.motor = new DCControl(node.pwmPin, node.left, node.right)
		node.handle.register(node.motor)

		node.on('input', function (msg)
		{
			node.motor.setSpeed(msg.payload)
		})

		node.on('close', function ()
		{
			node.handle.unRegister(node.motor); 
		})
	}

	RED.nodes.registerType('pca-manager', Handle)
	RED.nodes.registerType('pca-DC-motor', DCMotor)

}


