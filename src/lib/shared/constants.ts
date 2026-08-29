export const photoTypes = ["Product", "Invoice or receipt", "Information", "Other"];

export const ARCHETYPES = [
	{ 
		id: 'hardware', name: 'Hardware & Equipment', icon: 'bi-tools', 
		examples: 'Cameras, instruments, sports, electronics, tools, laptops, etc.', 
		defaults: [{label: 'AI Taxonomy', icon: 'bi-diagram-3', highlight: true, tooltip: 'Automatically generates a dynamic schema based on item properties'}] 
	},
	{ 
		id: 'apparel', name: 'Apparel & Soft Goods', icon: 'bi-handbag', 
		examples: 'Clothes, shoes, scarves, belts, bags, textiles, etc.', 
		defaults: [{label: 'AI Taxonomy', icon: 'bi-diagram-3', highlight: true, tooltip: 'Generates schemas'}, {label: 'Deep Scan', icon: 'bi-search', highlight: true, tooltip: 'Analyzes bulk images to find multiple distinct items'}] 
	},
	{ 
		id: 'media', name: 'Media & Publications', icon: 'bi-book', 
		examples: 'Books, comics, CDs, DVDs, vinyls, games, etc.', 
		defaults: [{label: 'Deep Scan', icon: 'bi-search', highlight: true, tooltip: 'Analyzes bulk images'}, {label: 'No BG Removal', icon: 'bi-image-fill', highlight: false, tooltip: 'Leaves the background intact, better for books and flat media'}] 
	},
	{ 
		id: 'consumables', name: 'Consumables & Pantry', icon: 'bi-basket', 
		examples: 'Whiskys, wines, groceries, canned veggies, spices, etc', 
		defaults: [{label: 'Standard', icon: 'bi-gear', highlight: false, tooltip: 'Standard default extraction'}] 
	},
	{ 
		id: 'collectibles', name: 'Valuables/Collectibles', icon: 'bi-gem', 
		examples: 'Coins, stamps, cards, sculptures, toys, Lego, posters, pet rocks, etc.', 
		defaults: [{label: 'AI Taxonomy', icon: 'bi-diagram-3', highlight: true, tooltip: 'Generates schemas'}, {label: 'Deep Scan', icon: 'bi-search', highlight: true, tooltip: 'Analyzes bulk images'}] 
	},
	{ 
		id: 'natural', name: 'Natural Specimens', icon: 'bi-tree', 
		examples: 'Plants, rocks, crystals, seashells, fossils, etc.', 
		defaults: [{label: 'AI Taxonomy', icon: 'bi-diagram-3', highlight: true, tooltip: 'Generates schemas'}] 
	},
	{ 
		id: 'generic', name: 'Generic / Mixed', icon: 'bi-box-seam', 
		examples: 'A mix of various unrelated items.', 
		defaults: [{label: 'Standard', icon: 'bi-gear', highlight: false, tooltip: 'Standard default extraction'}] 
	}
];