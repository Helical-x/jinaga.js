import Interface = require('./interface');
import isPredecessor = Interface.isPredecessor;

class FactReference {
    constructor(
        public id: number
    ) {
    }
}

class FactChannel {
    private nextId: number;
    
    constructor(
        private output: (string) => void
    ) {
        this.nextId = 1;
    }
    
    sendFact(fact: Object): FactReference {
        var memento = {};
        for (var field in fact) {
            var value = fact[field];
            if (isPredecessor(value)) {
                memento[field] = this.sendFact(value);
            }
            else {
                memento[field] = value;
            }
        }
        this.output(JSON.stringify({
            type: 'fact',
            id: this.nextId,
            fact: memento
        }));
        var reference = new FactReference(this.nextId);
        this.nextId += 2;
        return reference;
    }
}

export = FactChannel;
