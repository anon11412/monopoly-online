"""
Enhanced Trading System - Traditional Trade Layout + Function Blocks
Same as traditional trade but with drag-and-drop function blocks added
"""

import tkinter as tk
from tkinter import ttk, messagebox, simpledialog
from trading import Trade

class EnhancedTradingDialog:
    """Enhanced trading dialog with traditional layout + function blocks"""
    
    def __init__(self, parent, current_player, partner, game):
        self.parent = parent
        self.current_player = current_player
        self.partner = partner
        self.game = game
        
        # Traditional trading data
        self.offered_properties = []
        self.requested_properties = []
        self.offered_money = 0
        self.requested_money = 0
        
        # Function blocks data
        self.offered_blocks = []  # Blocks you're offering to execute
        self.requested_blocks = []  # Blocks you want partner to execute
        
        # Available blocks (exactly 3)
        self.available_blocks = [
            {
                "name": "Every Turn",
                "icon": "🔄",
                "type": "trigger",
                "description": "Triggers at start of each turn"
            },
            {
                "name": "For X Turns", 
                "icon": "⏱️",
                "type": "condition",
                "description": "Duration limit",
                "variables": {"turns": 20}
            },
            {
                "name": "Pay Money",
                "icon": "💰", 
                "type": "action",
                "description": "Transfer money between players",
                "variables": {"amount": 100}
            }
        ]
        
        self.create_dialog()
        
    def create_dialog(self):
        """Create the enhanced trading dialog"""
        self.dialog = tk.Toplevel(self.parent)
        self.dialog.title(f"Enhanced Trade with {self.partner.name}")
        self.dialog.geometry("900x700")
        self.dialog.configure(bg='#2c3e50')
        self.dialog.resizable(True, True)
        
        # Center dialog
        self.center_dialog()
        
        # Make modal
        self.dialog.transient(self.parent)
        self.dialog.grab_set()
        
        # Create the interface
        self.create_interface()
        
    def center_dialog(self):
        """Center the dialog on screen"""
        self.dialog.update_idletasks()
        width = self.dialog.winfo_reqwidth()
        height = self.dialog.winfo_reqheight()
        x = (self.dialog.winfo_screenwidth() // 2) - (width // 2)
        y = (self.dialog.winfo_screenheight() // 2) - (height // 2)
        self.dialog.geometry(f"{width}x{height}+{x}+{y}")
        
    def create_interface(self):
        """Create the main interface (same layout as traditional trade + blocks)"""
        
        # Header
        header_frame = ttk.Frame(self.dialog)
        header_frame.pack(fill='x', padx=10, pady=5)
        
        ttk.Label(header_frame, text=f"Enhanced Trading with {self.partner.name}", 
                 font=('Arial', 14, 'bold')).pack()
        
        # Main content frame
        main_frame = ttk.Frame(self.dialog)
        main_frame.pack(fill='both', expand=True, padx=10, pady=5)
        
        # Two-column layout (same as traditional trade)
        left_frame = ttk.LabelFrame(main_frame, text=f"Your Offer ({self.current_player.name})")
        left_frame.pack(side='left', fill='both', expand=True, padx=(0, 5))
        
        right_frame = ttk.LabelFrame(main_frame, text=f"Your Request (from {self.partner.name})")
        right_frame.pack(side='right', fill='both', expand=True, padx=(5, 0))
        
        # Create offer and request panels
        self.create_offer_panel(left_frame)
        self.create_request_panel(right_frame)
        
        # Control buttons
        self.create_control_buttons()
        
    def create_offer_panel(self, parent):
        """Create the offer panel (properties + function blocks)"""
        
        # Properties section (same as traditional)
        props_frame = ttk.LabelFrame(parent, text="Properties to Offer")
        props_frame.pack(fill='both', expand=True, padx=5, pady=5)
        
        # Scrollable properties list
        props_canvas = tk.Canvas(props_frame, height=150, bg='white')
        props_scrollbar = ttk.Scrollbar(props_frame, orient="vertical", command=props_canvas.yview)
        props_canvas.configure(yscrollcommand=props_scrollbar.set)
        
        self.offered_props_frame = ttk.Frame(props_canvas)
        props_canvas.create_window((0, 0), window=self.offered_props_frame, anchor="nw")
        
        props_canvas.pack(side="left", fill="both", expand=True)
        props_scrollbar.pack(side="right", fill="y")
        
        # Populate properties
        self.populate_offered_properties()
        
        # Money input
        money_frame = ttk.Frame(parent)
        money_frame.pack(fill='x', padx=5, pady=5)
        ttk.Label(money_frame, text="Money to Offer:").pack(side='left')
        self.offered_money_var = tk.StringVar(value="0")
        ttk.Entry(money_frame, textvariable=self.offered_money_var, width=10).pack(side='right')
        
        # Function Blocks section (NEW)
        blocks_frame = ttk.LabelFrame(parent, text="Function Blocks to Execute")
        blocks_frame.pack(fill='both', expand=True, padx=5, pady=5)
        
        # Available blocks palette
        palette_frame = ttk.Frame(blocks_frame)
        palette_frame.pack(fill='x', pady=5)
        ttk.Label(palette_frame, text="Click blocks to add:").pack(anchor='w')
        
        blocks_palette = ttk.Frame(palette_frame)
        blocks_palette.pack(fill='x', pady=5)
        
        for block in self.available_blocks:
            self.create_clickable_block(blocks_palette, block, "offer")
        
        # Added blocks area
        ttk.Label(blocks_frame, text="Your Function Blocks:").pack(anchor='w')
        self.offered_blocks_frame = ttk.Frame(blocks_frame)
        self.offered_blocks_frame.pack(fill='both', expand=True, pady=5)
        
        self.redraw_offered_blocks()
        
    def create_request_panel(self, parent):
        """Create the request panel (properties + function blocks)"""
        
        # Properties section
        props_frame = ttk.LabelFrame(parent, text="Properties to Request")
        props_frame.pack(fill='both', expand=True, padx=5, pady=5)
        
        # Scrollable properties list
        props_canvas = tk.Canvas(props_frame, height=150, bg='white')
        props_scrollbar = ttk.Scrollbar(props_frame, orient="vertical", command=props_canvas.yview)
        props_canvas.configure(yscrollcommand=props_scrollbar.set)
        
        self.requested_props_frame = ttk.Frame(props_canvas)
        props_canvas.create_window((0, 0), window=self.requested_props_frame, anchor="nw")
        
        props_canvas.pack(side="left", fill="both", expand=True)
        props_scrollbar.pack(side="right", fill="y")
        
        # Populate properties
        self.populate_requested_properties()
        
        # Money input
        money_frame = ttk.Frame(parent)
        money_frame.pack(fill='x', padx=5, pady=5)
        ttk.Label(money_frame, text="Money to Request:").pack(side='left')
        self.requested_money_var = tk.StringVar(value="0")
        ttk.Entry(money_frame, textvariable=self.requested_money_var, width=10).pack(side='right')
        
        # Function Blocks section (NEW)
        blocks_frame = ttk.LabelFrame(parent, text="Function Blocks to Request")
        blocks_frame.pack(fill='both', expand=True, padx=5, pady=5)
        
        # Available blocks palette
        palette_frame = ttk.Frame(blocks_frame)
        palette_frame.pack(fill='x', pady=5)
        ttk.Label(palette_frame, text="Click blocks to add:").pack(anchor='w')
        
        blocks_palette = ttk.Frame(palette_frame)
        blocks_palette.pack(fill='x', pady=5)
        
        for block in self.available_blocks:
            self.create_clickable_block(blocks_palette, block, "request")
        
        # Added blocks area
        ttk.Label(blocks_frame, text="Partner's Function Blocks:").pack(anchor='w')
        self.requested_blocks_frame = ttk.Frame(blocks_frame)
        self.requested_blocks_frame.pack(fill='both', expand=True, pady=5)
        
        self.redraw_requested_blocks()
        
    def create_clickable_block(self, parent, block, side):
        """Create a clickable function block (simplified from drag-and-drop)"""
        block_button = ttk.Button(parent, 
                                 text=f"{block['icon']} {block['name']}", 
                                 command=lambda b=block, s=side: self.add_block(b, s))
        block_button.pack(side='left', padx=2, pady=2)
        
    def add_block(self, block_data, side):
        """Add a function block to offer or request"""
        # Create a copy with variables
        block_copy = block_data.copy()
        if 'variables' in block_copy:
            block_copy['variables'] = block_copy['variables'].copy()
        
        if side == "offer":
            self.offered_blocks.append(block_copy)
            self.redraw_offered_blocks()
        else:
            self.requested_blocks.append(block_copy)
            self.redraw_requested_blocks()
        
    def redraw_offered_blocks(self):
        """Redraw the offered blocks list"""
        # Clear existing
        for widget in self.offered_blocks_frame.winfo_children():
            widget.destroy()
            
        if not self.offered_blocks:
            ttk.Label(self.offered_blocks_frame, text="No blocks added", 
                     foreground='gray').pack()
            return
            
        for i, block in enumerate(self.offered_blocks):
            self.create_block_widget(self.offered_blocks_frame, block, i, "offer")
            
    def redraw_requested_blocks(self):
        """Redraw the requested blocks list"""
        # Clear existing
        for widget in self.requested_blocks_frame.winfo_children():
            widget.destroy()
            
        if not self.requested_blocks:
            ttk.Label(self.requested_blocks_frame, text="No blocks added", 
                     foreground='gray').pack()
            return
            
        for i, block in enumerate(self.requested_blocks):
            self.create_block_widget(self.requested_blocks_frame, block, i, "request")
            
    def create_block_widget(self, parent, block, index, side):
        """Create a widget for a placed function block with inline inputs"""
        block_frame = ttk.Frame(parent, relief='raised', borderwidth=1)
        block_frame.pack(fill='x', padx=2, pady=2)
        
        # Block header
        header_frame = ttk.Frame(block_frame)
        header_frame.pack(fill='x', padx=5, pady=2)
        
        ttk.Label(header_frame, text=f"{block['icon']} {block['name']}", 
                 font=('Arial', 10, 'bold')).pack(side='left')
        
        # Remove button
        ttk.Button(header_frame, text="×", width=3,
                  command=lambda: self.remove_block(index, side)).pack(side='right')
        
        # Variables (inline inputs)
        if 'variables' in block:
            vars_frame = ttk.Frame(block_frame)
            vars_frame.pack(fill='x', padx=5, pady=2)
            
            for var_name, default_value in block['variables'].items():
                var_frame = ttk.Frame(vars_frame)
                var_frame.pack(fill='x', pady=1)
                
                ttk.Label(var_frame, text=f"{var_name.title()}:").pack(side='left')
                
                var_entry = ttk.Entry(var_frame, width=10)
                var_entry.pack(side='right')
                var_entry.insert(0, str(default_value))
                
                # Update variable when changed
                def update_var(event, idx=index, var=var_name, s=side):
                    try:
                        new_value = float(event.widget.get()) if var == 'amount' else int(event.widget.get())
                        blocks_list = self.offered_blocks if s == "offer" else self.requested_blocks
                        blocks_list[idx]['variables'][var] = new_value
                    except ValueError:
                        pass  # Invalid input, ignore
                        
                var_entry.bind('<KeyRelease>', update_var)
                
    def remove_block(self, index, side):
        """Remove a block from offer or request"""
        if side == "offer":
            self.offered_blocks.pop(index)
            self.redraw_offered_blocks()
        else:
            self.requested_blocks.pop(index)
            self.redraw_requested_blocks()
            
    def populate_offered_properties(self):
        """Populate the offered properties list"""
        # Clear existing
        for widget in self.offered_props_frame.winfo_children():
            widget.destroy()
            
        # Add current player's properties
        for prop in self.current_player.properties:
            var = tk.BooleanVar()
            cb = ttk.Checkbutton(self.offered_props_frame, text=prop.name, variable=var)
            cb.pack(anchor='w', padx=5, pady=1)
            cb.property = prop
            cb.var = var
            
    def populate_requested_properties(self):
        """Populate the requested properties list"""
        # Clear existing
        for widget in self.requested_props_frame.winfo_children():
            widget.destroy()
            
        # Add partner's properties
        for prop in self.partner.properties:
            var = tk.BooleanVar()
            cb = ttk.Checkbutton(self.requested_props_frame, text=prop.name, variable=var)
            cb.pack(anchor='w', padx=5, pady=1)
            cb.property = prop
            cb.var = var
            
    def create_control_buttons(self):
        """Create control buttons"""
        button_frame = ttk.Frame(self.dialog)
        button_frame.pack(fill='x', padx=10, pady=10)
        
        ttk.Button(button_frame, text="Cancel", 
                  command=self.dialog.destroy).pack(side='left')
        ttk.Button(button_frame, text="Clear All", 
                  command=self.clear_all).pack(side='left', padx=10)
        ttk.Button(button_frame, text="Propose Trade", 
                  command=self.propose_trade).pack(side='right')
                  
    def clear_all(self):
        """Clear all selections"""
        # Clear property selections
        for widget in self.offered_props_frame.winfo_children():
            if hasattr(widget, 'var'):
                widget.var.set(False)
                
        for widget in self.requested_props_frame.winfo_children():
            if hasattr(widget, 'var'):
                widget.var.set(False)
                
        # Clear money
        self.offered_money_var.set("0")
        self.requested_money_var.set("0")
        
        # Clear blocks
        self.offered_blocks.clear()
        self.requested_blocks.clear()
        self.redraw_offered_blocks()
        self.redraw_requested_blocks()
        
    def propose_trade(self):
        """Propose the enhanced trade"""
        try:
            # Get selected properties
            offered_props = []
            for widget in self.offered_props_frame.winfo_children():
                if hasattr(widget, 'var') and widget.var.get():
                    offered_props.append(widget.property)
                    
            requested_props = []
            for widget in self.requested_props_frame.winfo_children():
                if hasattr(widget, 'var') and widget.var.get():
                    requested_props.append(widget.property)
            
            # Get money amounts
            offered_money = float(self.offered_money_var.get() or 0)
            requested_money = float(self.requested_money_var.get() or 0)
            
            # Create enhanced trade
            trade = EnhancedTrade(
                proposer=self.current_player,
                recipient=self.partner,
                offered_properties=offered_props,
                requested_properties=requested_props,
                offered_money=offered_money,
                requested_money=requested_money,
                offered_blocks=self.offered_blocks.copy(),
                requested_blocks=self.requested_blocks.copy()
            )
            
            # Add to pending trades
            self.game.add_pending_trade(trade)
            
            messagebox.showinfo("Trade Proposed", 
                              f"Enhanced trade proposed to {self.partner.name}!")
            self.dialog.destroy()
            
        except Exception as e:
            messagebox.showerror("Error", f"Failed to propose trade: {e}")


class EnhancedTrade(Trade):
    """Enhanced trade that includes function blocks"""
    
    def __init__(self, proposer, recipient, offered_properties, requested_properties, 
                 offered_money, requested_money, offered_blocks=None, requested_blocks=None):
        super().__init__(proposer, recipient, offered_properties, requested_properties, 
                        offered_money, requested_money)
        
        self.offered_blocks = offered_blocks or []
        self.requested_blocks = requested_blocks or []
        
    def get_summary(self):
        """Get enhanced trade summary including function blocks"""
        summary = super().get_summary()
        
        if self.offered_blocks:
            summary += f"\n\n{self.proposer.name}'s Function Blocks:"
            for block in self.offered_blocks:
                variables = ""
                if 'variables' in block:
                    variables = " (" + ", ".join(f"{k}={v}" for k, v in block['variables'].items()) + ")"
                summary += f"\n  • {block['icon']} {block['name']}{variables}"
                
        if self.requested_blocks:
            summary += f"\n\n{self.recipient.name}'s Function Blocks:"
            for block in self.requested_blocks:
                variables = ""
                if 'variables' in block:
                    variables = " (" + ", ".join(f"{k}={v}" for k, v in block['variables'].items()) + ")"
                summary += f"\n  • {block['icon']} {block['name']}{variables}"
                
        return summary
        
    def has_function_blocks(self):
        """Check if this trade has function blocks"""
        return bool(self.offered_blocks or self.requested_blocks)


def open_enhanced_trade_dialog(parent, current_player, partner, game):
    """Open the enhanced trading dialog"""
    dialog = EnhancedTradingDialog(parent, current_player, partner, game)
    return dialog
