"""
Enhanced Trading System - Traditional Trade Layout + Function Blocks
Same interface as traditional trading but with drag-and-drop function blocks added
"""

import tkinter as tk
from tkinter import ttk, messagebox, simpledialog
from trading import Trade

class EnhancedTradingDialog:
    """Enhanced trading dialog with traditional layout + function blocks"""
    
    def __init__(self, parent, current_player, all_players, game):
        self.parent = parent
        self.current_player = current_player
        self.all_players = all_players
        self.game = game
        
        # Traditional trading data
        self.offered_properties = []
        self.requested_properties = []
        self.offered_money = 0
        self.requested_money = 0
        self.selected_partner = None
        
        # Function blocks data
        self.offered_function_blocks = []  # Blocks dragged to offer side
        self.requested_function_blocks = []  # Blocks dragged to request side
        
        # UI references
        self.dialog = None
        self.partner_var = None
        self.offer_blocks_frame = None
        self.request_blocks_frame = None
        
        self.create_dialog()
    
    def create_dialog(self):
        """Create the enhanced trading dialog"""
        self.dialog = tk.Toplevel(self.parent)
        self.dialog.title("Enhanced Trading - Properties & Function Blocks")
        self.dialog.geometry("1000x700")
        self.dialog.resizable(True, True)
        
        # Center dialog
        self.center_dialog()
        
        # Make modal
        self.dialog.grab_set()
        self.dialog.focus_set()
        
        # Create main interface
        self.create_main_interface()
    
    def center_dialog(self):
        """Center the dialog on screen"""
        self.dialog.update_idletasks()
        width = self.dialog.winfo_width()
        height = self.dialog.winfo_height()
        x = (self.dialog.winfo_screenwidth() // 2) - (width // 2)
        y = (self.dialog.winfo_screenheight() // 2) - (height // 2)
        self.dialog.geometry(f'{width}x{height}+{x}+{y}')
    
    def create_main_interface(self):
        """Create the main trading interface"""
        main_frame = ttk.Frame(self.dialog)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Title and partner selection
        title_frame = ttk.Frame(main_frame)
        title_frame.pack(fill=tk.X, pady=(0, 10))
        
        ttk.Label(title_frame, text="🔄⚡ Enhanced Trading", 
                 font=('Arial', 16, 'bold')).pack(side=tk.LEFT)
        
        # Partner selection
        partner_frame = ttk.Frame(title_frame)
        partner_frame.pack(side=tk.RIGHT)
        
        ttk.Label(partner_frame, text="Trading with:").pack(side=tk.LEFT, padx=(0, 5))
        
        available_players = [p for p in self.all_players if p != self.current_player and not p.bankrupt]
        self.partner_var = tk.StringVar()
        partner_combo = ttk.Combobox(partner_frame, textvariable=self.partner_var, 
                                   values=[p.name for p in available_players], 
                                   state="readonly", width=15)
        partner_combo.pack(side=tk.LEFT)
        partner_combo.bind('<<ComboboxSelected>>', self.on_partner_selected)
        
        # Main trading area (two columns)
        trading_frame = ttk.Frame(main_frame)
        trading_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 10))
        
        # Left column - Your Offer
        offer_frame = ttk.LabelFrame(trading_frame, text="📤 Your Offer", padding=10)
        offer_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 5))
        
        # Right column - Your Request  
        request_frame = ttk.LabelFrame(trading_frame, text="📥 Your Request", padding=10)
        request_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=(5, 0))
        
        # Create offer and request panels
        self.create_offer_panel(offer_frame)
        self.create_request_panel(request_frame)
        
        # Function blocks palette at bottom
        self.create_blocks_palette(main_frame)
        
        # Action buttons
        self.create_action_buttons(main_frame)
    
    def create_offer_panel(self, parent):
        """Create the offer panel (properties + money + function blocks)"""
        # Properties section
        props_frame = ttk.LabelFrame(parent, text="Properties")
        props_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 5))
        
        # Scrollable properties list
        props_canvas = tk.Canvas(props_frame, height=120)
        props_scrollbar = ttk.Scrollbar(props_frame, orient="vertical", command=props_canvas.yview)
        self.offer_props_frame = ttk.Frame(props_canvas)
        
        props_canvas.configure(yscrollcommand=props_scrollbar.set)
        props_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        props_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        props_canvas.create_window((0, 0), window=self.offer_props_frame, anchor="nw")
        self.offer_props_frame.bind("<Configure>", lambda e: props_canvas.configure(scrollregion=props_canvas.bbox("all")))
        
        # Money section
        money_frame = ttk.LabelFrame(parent, text="Money")
        money_frame.pack(fill=tk.X, pady=(5, 5))
        
        money_subframe = ttk.Frame(money_frame)
        money_subframe.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Label(money_subframe, text="$").pack(side=tk.LEFT)
        self.offer_money_var = tk.StringVar(value="0")
        money_entry = ttk.Entry(money_subframe, textvariable=self.offer_money_var, width=10)
        money_entry.pack(side=tk.LEFT, padx=(2, 0))
        
        # Function Blocks drop zone
        blocks_frame = ttk.LabelFrame(parent, text="Function Blocks")
        blocks_frame.pack(fill=tk.BOTH, expand=True, pady=(5, 0))
        
        # Drop zone for function blocks
        self.offer_blocks_frame = tk.Frame(blocks_frame, bg="#f0f0f0", relief=tk.SUNKEN, bd=1)
        self.offer_blocks_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Drop zone label
        drop_label = tk.Label(self.offer_blocks_frame, text="Drag function blocks here", 
                             bg="#f0f0f0", fg="#666666", font=('Arial', 10, 'italic'))
        drop_label.pack(expand=True)
        
        # Enable dropping
        self.setup_drop_zone(self.offer_blocks_frame, "offer")
    
    def create_request_panel(self, parent):
        """Create the request panel (properties + money + function blocks)"""
        # Properties section
        props_frame = ttk.LabelFrame(parent, text="Properties")
        props_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 5))
        
        # Scrollable properties list
        props_canvas = tk.Canvas(props_frame, height=120)
        props_scrollbar = ttk.Scrollbar(props_frame, orient="vertical", command=props_canvas.yview)
        self.request_props_frame = ttk.Frame(props_canvas)
        
        props_canvas.configure(yscrollcommand=props_scrollbar.set)
        props_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        props_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        props_canvas.create_window((0, 0), window=self.request_props_frame, anchor="nw")
        self.request_props_frame.bind("<Configure>", lambda e: props_canvas.configure(scrollregion=props_canvas.bbox("all")))
        
        # Money section
        money_frame = ttk.LabelFrame(parent, text="Money")
        money_frame.pack(fill=tk.X, pady=(5, 5))
        
        money_subframe = ttk.Frame(money_frame)
        money_subframe.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Label(money_subframe, text="$").pack(side=tk.LEFT)
        self.request_money_var = tk.StringVar(value="0")
        money_entry = ttk.Entry(money_subframe, textvariable=self.request_money_var, width=10)
        money_entry.pack(side=tk.LEFT, padx=(2, 0))
        
        # Function Blocks drop zone
        blocks_frame = ttk.LabelFrame(parent, text="Function Blocks")
        blocks_frame.pack(fill=tk.BOTH, expand=True, pady=(5, 0))
        
        # Drop zone for function blocks
        self.request_blocks_frame = tk.Frame(blocks_frame, bg="#f0f0f0", relief=tk.SUNKEN, bd=1)
        self.request_blocks_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Drop zone label
        drop_label = tk.Label(self.request_blocks_frame, text="Drag function blocks here", 
                             bg="#f0f0f0", fg="#666666", font=('Arial', 10, 'italic'))
        drop_label.pack(expand=True)
        
        # Enable dropping
        self.setup_drop_zone(self.request_blocks_frame, "request")
    
    def create_blocks_palette(self, parent):
        """Create the function blocks palette"""
        palette_frame = ttk.LabelFrame(parent, text="📦 Function Blocks Palette (Drag to add)")
        palette_frame.pack(fill=tk.X, pady=(10, 0))
        
        # Container for blocks
        blocks_container = ttk.Frame(palette_frame)
        blocks_container.pack(fill=tk.X, padx=10, pady=10)
        
        # The 3 essential function blocks
        blocks = [
            {"name": "Every Turn", "icon": "🔄", "color": "#3498db", "description": "Triggers every turn"},
            {"name": "For X Turns", "icon": "⏱️", "color": "#e67e22", "description": "Duration: X turns", "has_input": True, "input_label": "Turns:"},
            {"name": "Pay Money", "icon": "💰", "color": "#27ae60", "description": "Transfer money", "has_input": True, "input_label": "Amount: $"}
        ]
        
        for i, block in enumerate(blocks):
            self.create_draggable_block(blocks_container, block, i)
    
    def create_draggable_block(self, parent, block_data, index):
        """Create a draggable function block"""
        # Block frame
        block_frame = tk.Frame(parent, bg=block_data["color"], relief=tk.RAISED, bd=2)
        block_frame.pack(side=tk.LEFT, padx=10, pady=5)
        
        # Block content
        content_frame = tk.Frame(block_frame, bg=block_data["color"])
        content_frame.pack(padx=8, pady=6)
        
        # Icon and name
        header_frame = tk.Frame(content_frame, bg=block_data["color"])
        header_frame.pack()
        
        icon_label = tk.Label(header_frame, text=block_data["icon"], bg=block_data["color"], 
                             font=('Arial', 14))
        icon_label.pack(side=tk.LEFT)
        
        name_label = tk.Label(header_frame, text=block_data["name"], bg=block_data["color"], 
                             fg="white", font=('Arial', 10, 'bold'))
        name_label.pack(side=tk.LEFT, padx=(5, 0))
        
        # Description
        desc_label = tk.Label(content_frame, text=block_data["description"], bg=block_data["color"], 
                             fg="white", font=('Arial', 8))
        desc_label.pack()
        
        # Enable dragging
        self.make_draggable(block_frame, block_data)
        for widget in [content_frame, header_frame, icon_label, name_label, desc_label]:
            self.make_draggable(widget, block_data)
    
    def make_draggable(self, widget, block_data):
        """Make a widget draggable"""
        def start_drag(event):
            widget.drag_data = {"x": event.x, "y": event.y, "block": block_data}
        
        def on_drag(event):
            # Calculate how far the mouse has moved
            dx = event.x - widget.drag_data["x"]
            dy = event.y - widget.drag_data["y"]
            
            # Move widget (visual feedback could be added here)
            pass
        
        def end_drag(event):
            # Find what's under the mouse
            x, y = event.x_root, event.y_root
            target = widget.winfo_containing(x, y)
            
            # Check if we're over a drop zone
            if target and hasattr(target, 'drop_zone_type'):
                self.drop_block(block_data, target.drop_zone_type)
        
        widget.bind("<Button-1>", start_drag)
        widget.bind("<B1-Motion>", on_drag)
        widget.bind("<ButtonRelease-1>", end_drag)
    
    def setup_drop_zone(self, frame, zone_type):
        """Setup a frame as a drop zone"""
        frame.drop_zone_type = zone_type
        
        # Add visual feedback for drop zones
        def on_enter(event):
            frame.configure(bg="#e8f4fd")
        
        def on_leave(event):
            frame.configure(bg="#f0f0f0")
        
        frame.bind("<Enter>", on_enter)
        frame.bind("<Leave>", on_leave)
    
    def drop_block(self, block_data, zone_type):
        """Handle dropping a block into a zone"""
        # Create a copy of the block data for this instance
        block_instance = {
            "name": block_data["name"],
            "icon": block_data["icon"],
            "color": block_data["color"],
            "description": block_data["description"],
            "values": {}  # Store input values
        }
        
        # Add to appropriate list
        if zone_type == "offer":
            self.offered_function_blocks.append(block_instance)
            self.refresh_blocks_display(self.offer_blocks_frame, self.offered_function_blocks, "offer")
        elif zone_type == "request":
            self.requested_function_blocks.append(block_instance)
            self.refresh_blocks_display(self.request_blocks_frame, self.requested_function_blocks, "request")
    
    def refresh_blocks_display(self, container, blocks_list, zone_type):
        """Refresh the display of blocks in a zone"""
        # Clear existing widgets
        for widget in container.winfo_children():
            widget.destroy()
        
        if not blocks_list:
            # Show placeholder
            placeholder = tk.Label(container, text="Drag function blocks here", 
                                 bg="#f0f0f0", fg="#666666", font=('Arial', 10, 'italic'))
            placeholder.pack(expand=True)
            return
        
        # Create block widgets with inline inputs
        for i, block in enumerate(blocks_list):
            self.create_dropped_block(container, block, i, zone_type)
    
    def create_dropped_block(self, parent, block_data, index, zone_type):
        """Create a dropped block with inline inputs"""
        # Block container
        block_container = tk.Frame(parent, bg=block_data["color"], relief=tk.RAISED, bd=2)
        block_container.pack(fill=tk.X, padx=2, pady=2)
        
        # Block header with icon, name, and remove button
        header_frame = tk.Frame(block_container, bg=block_data["color"])
        header_frame.pack(fill=tk.X, padx=5, pady=3)
        
        # Icon and name
        tk.Label(header_frame, text=block_data["icon"], bg=block_data["color"], 
                font=('Arial', 12)).pack(side=tk.LEFT)
        tk.Label(header_frame, text=block_data["name"], bg=block_data["color"], 
                fg="white", font=('Arial', 9, 'bold')).pack(side=tk.LEFT, padx=(5, 0))
        
        # Remove button
        remove_btn = tk.Button(header_frame, text="×", bg="#e74c3c", fg="white", 
                              font=('Arial', 8, 'bold'), relief=tk.FLAT, width=2,
                              command=lambda: self.remove_block(index, zone_type))
        remove_btn.pack(side=tk.RIGHT)
        
        # Inline inputs based on block type
        if block_data["name"] == "For X Turns":
            input_frame = tk.Frame(block_container, bg=block_data["color"])
            input_frame.pack(fill=tk.X, padx=5, pady=2)
            
            tk.Label(input_frame, text="Turns:", bg=block_data["color"], 
                    fg="white", font=('Arial', 8)).pack(side=tk.LEFT)
            
            turns_var = tk.StringVar(value=block_data["values"].get("turns", "20"))
            turns_entry = tk.Entry(input_frame, textvariable=turns_var, width=8, font=('Arial', 8))
            turns_entry.pack(side=tk.LEFT, padx=(5, 0))
            
            # Update block data when entry changes
            def update_turns(*args):
                block_data["values"]["turns"] = turns_var.get()
            turns_var.trace("w", update_turns)
            
        elif block_data["name"] == "Pay Money":
            input_frame = tk.Frame(block_container, bg=block_data["color"])
            input_frame.pack(fill=tk.X, padx=5, pady=2)
            
            tk.Label(input_frame, text="Amount: $", bg=block_data["color"], 
                    fg="white", font=('Arial', 8)).pack(side=tk.LEFT)
            
            amount_var = tk.StringVar(value=block_data["values"].get("amount", "100"))
            amount_entry = tk.Entry(input_frame, textvariable=amount_var, width=8, font=('Arial', 8))
            amount_entry.pack(side=tk.LEFT, padx=(5, 0))
            
            # Update block data when entry changes
            def update_amount(*args):
                block_data["values"]["amount"] = amount_var.get()
            amount_var.trace("w", update_amount)
    
    def remove_block(self, index, zone_type):
        """Remove a block from the specified zone"""
        if zone_type == "offer" and 0 <= index < len(self.offered_function_blocks):
            self.offered_function_blocks.pop(index)
            self.refresh_blocks_display(self.offer_blocks_frame, self.offered_function_blocks, "offer")
        elif zone_type == "request" and 0 <= index < len(self.requested_function_blocks):
            self.requested_function_blocks.pop(index)
            self.refresh_blocks_display(self.request_blocks_frame, self.requested_function_blocks, "request")
    
    def on_partner_selected(self, event=None):
        """Handle partner selection"""
        partner_name = self.partner_var.get()
        self.selected_partner = next((p for p in self.all_players if p.name == partner_name), None)
        
        if self.selected_partner:
            self.populate_property_lists()
    
    def populate_property_lists(self):
        """Populate the property lists for current player and partner"""
        if not self.selected_partner:
            return
        
        # Clear existing property widgets
        for widget in self.offer_props_frame.winfo_children():
            widget.destroy()
        for widget in self.request_props_frame.winfo_children():
            widget.destroy()
        
        # Current player's properties (offer side)
        for prop in self.current_player.properties:
            var = tk.BooleanVar()
            cb = ttk.Checkbutton(self.offer_props_frame, text=f"{prop.name} (${prop.price})", 
                               variable=var)
            cb.pack(anchor=tk.W, pady=1)
            cb.property = prop
            cb.var = var
        
        # Partner's properties (request side)
        for prop in self.selected_partner.properties:
            var = tk.BooleanVar()
            cb = ttk.Checkbutton(self.request_props_frame, text=f"{prop.name} (${prop.price})", 
                               variable=var)
            cb.pack(anchor=tk.W, pady=1)
            cb.property = prop
            cb.var = var
    
    def create_action_buttons(self, parent):
        """Create action buttons"""
        buttons_frame = ttk.Frame(parent)
        buttons_frame.pack(fill=tk.X, pady=(10, 0))
        
        ttk.Button(buttons_frame, text="Clear All", 
                  command=self.clear_trade).pack(side=tk.LEFT)
        
        ttk.Button(buttons_frame, text="Cancel", 
                  command=self.dialog.destroy).pack(side=tk.RIGHT, padx=(5, 0))
        
        ttk.Button(buttons_frame, text="Propose Trade", 
                  command=self.propose_trade).pack(side=tk.RIGHT)
    
    def clear_trade(self):
        """Clear all trade selections"""
        # Clear property selections
        for widget in self.offer_props_frame.winfo_children():
            if hasattr(widget, 'var'):
                widget.var.set(False)
        for widget in self.request_props_frame.winfo_children():
            if hasattr(widget, 'var'):
                widget.var.set(False)
        
        # Clear money
        self.offer_money_var.set("0")
        self.request_money_var.set("0")
        
        # Clear function blocks
        self.offered_function_blocks.clear()
        self.requested_function_blocks.clear()
        self.refresh_blocks_display(self.offer_blocks_frame, self.offered_function_blocks, "offer")
        self.refresh_blocks_display(self.request_blocks_frame, self.requested_function_blocks, "request")
    
    def propose_trade(self):
        """Propose the trade"""
        if not self.selected_partner:
            messagebox.showerror("Error", "Please select a trading partner")
            return
        
        # Collect selected properties
        offered_properties = []
        for widget in self.offer_props_frame.winfo_children():
            if hasattr(widget, 'var') and widget.var.get():
                offered_properties.append(widget.property)
        
        requested_properties = []
        for widget in self.request_props_frame.winfo_children():
            if hasattr(widget, 'var') and widget.var.get():
                requested_properties.append(widget.property)
        
        # Get money amounts
        try:
            offered_money = int(self.offer_money_var.get() or "0")
            requested_money = int(self.request_money_var.get() or "0")
        except ValueError:
            messagebox.showerror("Error", "Please enter valid money amounts")
            return
        
        # Check if there's anything to trade
        if (not offered_properties and not requested_properties and 
            offered_money == 0 and requested_money == 0 and 
            not self.offered_function_blocks and not self.requested_function_blocks):
            messagebox.showerror("Error", "Please select something to trade")
            return
        
        # Create enhanced trade object
        trade = EnhancedTrade(
            proposer=self.current_player,
            recipient=self.selected_partner,
            offered_properties=offered_properties,
            requested_properties=requested_properties,
            offered_money=offered_money,
            requested_money=requested_money,
            offered_function_blocks=self.offered_function_blocks.copy(),
            requested_function_blocks=self.requested_function_blocks.copy()
        )
        
        # Add to pending trades
        self.game.add_pending_trade(trade)
        
        # Show confirmation
        messagebox.showinfo("Trade Proposed", 
                           f"Trade proposal sent to {self.selected_partner.name}")
        
        # Close dialog
        self.dialog.destroy()


class EnhancedTrade(Trade):
    """Enhanced trade class that supports function blocks"""
    
    def __init__(self, proposer, recipient, offered_properties, requested_properties, 
                 offered_money, requested_money, offered_function_blocks=None, 
                 requested_function_blocks=None):
        super().__init__(proposer, recipient, offered_properties, requested_properties, 
                        offered_money, requested_money)
        
        self.offered_function_blocks = offered_function_blocks or []
        self.requested_function_blocks = requested_function_blocks or []
    
    def has_function_blocks(self):
        """Check if this trade has any function blocks"""
        return len(self.offered_function_blocks) > 0 or len(self.requested_function_blocks) > 0
    
    def get_summary(self):
        """Get enhanced trade summary including function blocks"""
        summary = super().get_summary()
        
        if self.has_function_blocks():
            summary += "\n\nFunction Blocks:"
            
            if self.offered_function_blocks:
                summary += f"\n{self.proposer.name} offers blocks:"
                for block in self.offered_function_blocks:
                    block_desc = f"\n  • {block['icon']} {block['name']}"
                    if block['name'] == "For X Turns" and 'turns' in block.get('values', {}):
                        block_desc += f" ({block['values']['turns']} turns)"
                    elif block['name'] == "Pay Money" and 'amount' in block.get('values', {}):
                        block_desc += f" (${block['values']['amount']})"
                    summary += block_desc
            
            if self.requested_function_blocks:
                summary += f"\n{self.recipient.name} offers blocks:"
                for block in self.requested_function_blocks:
                    block_desc = f"\n  • {block['icon']} {block['name']}"
                    if block['name'] == "For X Turns" and 'turns' in block.get('values', {}):
                        block_desc += f" ({block['values']['turns']} turns)"
                    elif block['name'] == "Pay Money" and 'amount' in block.get('values', {}):
                        block_desc += f" (${block['values']['amount']})"
                    summary += block_desc
        
        return summary


def open_enhanced_trade_dialog(parent, current_player, all_players, game):
    """Open the enhanced trading dialog"""
    print("🔄⚡ Opening ENHANCED trading dialog...")  # Debug output
    dialog = EnhancedTradingDialog(parent, current_player, all_players, game)
    print("✅ Enhanced trading dialog opened successfully!")  # Debug output
    return dialog
