"""
Advanced Trading System with Modular Function Blocks
Inspired by Scratch.io block programming
"""

import tkinter as tk
from tkinter import ttk, messagebox, simpledialog
import json

class AdvancedTradingDialog:
    def __init__(self, parent, current_player, all_players, game):
        self.parent = parent
        self.current_player = current_player
        self.all_players = all_players
        self.game = game
        self.selected_partner = None
        
        # Function blocks system
        self.available_blocks = []
        self.proposer_trade_chain = []  # Blocks added by proposer
        self.recipient_trade_chain = []  # Blocks added by recipient
        self.proposer_block_variables = {}  # Store variable values for proposer blocks
        self.recipient_block_variables = {}  # Store variable values for recipient blocks
        self.current_side = "proposer"  # Which side is currently building blocks
        
        # Traditional trading lists
        self.offered_properties = []
        self.requested_properties = []
        self.offered_money = 0
        self.requested_money = 0
        
        self.create_dialog()
        
    def create_dialog(self):
        self.dialog = tk.Toplevel(self.parent)
        self.dialog.title("Advanced Trading System")
        self.dialog.geometry("1000x700")
        self.dialog.configure(bg='#2c3e50')
        
        # Center dialog
        self.center_dialog()
        
        # Make modal
        self.dialog.transient(self.parent)
        self.dialog.grab_set()
        
        # Click outside to close
        self.dialog.bind('<Button-1>', self.check_click_outside)
        
        # Create main interface
        self.create_main_interface()
        
    def center_dialog(self):
        self.dialog.update_idletasks()
        x = (self.dialog.winfo_screenwidth() // 2) - (self.dialog.winfo_width() // 2)
        y = (self.dialog.winfo_screenheight() // 2) - (self.dialog.winfo_height() // 2)
        self.dialog.geometry(f"+{x}+{y}")
        
    def check_click_outside(self, event):
        # If click is on the main dialog window (not a child widget), close
        if event.widget == self.dialog:
            self.dialog.destroy()
    
    def create_main_interface(self):
        # Create notebook for tabs
        notebook = ttk.Notebook(self.dialog)
        notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Combined Tab: Everything in one interface
        self.combined_frame = ttk.Frame(notebook)
        notebook.add(self.combined_frame, text="🔧 Advanced Trading")
        self.setup_combined_trading_tab()
        
        # Tab 2: Deal Summary
        self.summary_frame = ttk.Frame(notebook)
        notebook.add(self.summary_frame, text="📋 Deal Summary")
        self.setup_summary_tab()
        
    def setup_combined_trading_tab(self):
        """Combined interface with traditional trading + function blocks"""
        # Create main container
        main_container = ttk.Frame(self.combined_frame)
        main_container.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Top section - Partner selection and traditional trading
        top_section = ttk.Frame(main_container)
        top_section.pack(fill=tk.X, pady=(0, 10))
        
        # Partner selection
        partner_frame = ttk.LabelFrame(top_section, text="🤝 Trading Partner", padding=10)
        partner_frame.pack(fill=tk.X, pady=(0, 10))
        
        self.partner_var = tk.StringVar()
        available_players = [p.name for p in self.all_players if p != self.current_player and not p.bankrupt]
        self.partner_combo = ttk.Combobox(partner_frame, textvariable=self.partner_var, 
                                         values=available_players, state="readonly", width=20)
        self.partner_combo.pack(side=tk.LEFT, padx=(0, 10))
        self.partner_combo.bind('<<ComboboxSelected>>', self.on_partner_selected)
        
        ttk.Label(partner_frame, text="Select who you want to trade with").pack(side=tk.LEFT)
        
        # Traditional trading section (horizontal)
        trad_frame = ttk.LabelFrame(top_section, text="💰 Traditional Exchange", padding=10)
        trad_frame.pack(fill=tk.X)
        
        # You offer section
        offer_section = ttk.Frame(trad_frame)
        offer_section.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 10))
        
        ttk.Label(offer_section, text="You Offer:", font=('Arial', 10, 'bold')).pack(anchor=tk.W)
        
        # Properties you offer
        self.offer_properties_frame = ttk.Frame(offer_section)
        self.offer_properties_frame.pack(fill=tk.X, pady=2)
        
        # Money you offer
        money_offer_frame = ttk.Frame(offer_section)
        money_offer_frame.pack(fill=tk.X, pady=2)
        ttk.Label(money_offer_frame, text="Cash: $").pack(side=tk.LEFT)
        self.offer_money_var = tk.StringVar(value="0")
        self.offer_money_entry = ttk.Entry(money_offer_frame, textvariable=self.offer_money_var, width=8)
        self.offer_money_entry.pack(side=tk.LEFT)
        
        # You want section
        want_section = ttk.Frame(trad_frame)
        want_section.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=(10, 0))
        
        ttk.Label(want_section, text="You Want:", font=('Arial', 10, 'bold')).pack(anchor=tk.W)
        
        # Properties you want
        self.request_properties_frame = ttk.Frame(want_section)
        self.request_properties_frame.pack(fill=tk.X, pady=2)
        
        # Money you want
        money_request_frame = ttk.Frame(want_section)
        money_request_frame.pack(fill=tk.X, pady=2)
        ttk.Label(money_request_frame, text="Cash: $").pack(side=tk.LEFT)
        self.request_money_var = tk.StringVar(value="0")
        self.request_money_entry = ttk.Entry(money_request_frame, textvariable=self.request_money_var, width=8)
        self.request_money_entry.pack(side=tk.LEFT)
        
        # Bottom section - Function blocks with bilateral support
        bottom_section = ttk.LabelFrame(main_container, text="⚡ Advanced Function Blocks", padding=10)
        bottom_section.pack(fill=tk.BOTH, expand=True)
        
        # Side selector
        side_frame = ttk.Frame(bottom_section)
        side_frame.pack(fill=tk.X, pady=(0, 10))
        
        ttk.Label(side_frame, text="Building blocks for:", font=('Arial', 10, 'bold')).pack(side=tk.LEFT)
        
        self.side_var = tk.StringVar(value="proposer")
        proposer_radio = ttk.Radiobutton(side_frame, text=f"🙋 {self.current_player.name} (You)", 
                                        variable=self.side_var, value="proposer",
                                        command=self.switch_side)
        proposer_radio.pack(side=tk.LEFT, padx=(10, 5))
        
        self.recipient_radio = ttk.Radiobutton(side_frame, text="🤝 Trading Partner", 
                                              variable=self.side_var, value="recipient",
                                              command=self.switch_side)
        self.recipient_radio.pack(side=tk.LEFT, padx=(5, 0))
        
        # Create three columns for function blocks
        blocks_container = ttk.Frame(bottom_section)
        blocks_container.pack(fill=tk.BOTH, expand=True)
        
        # Left column - Available blocks
        blocks_frame = ttk.LabelFrame(blocks_container, text="📦 Available Blocks", padding=5)
        blocks_frame.pack(side=tk.LEFT, fill=tk.Y, padx=(0, 5))
        
        # Scrollable frame for blocks
        blocks_canvas = tk.Canvas(blocks_frame, width=200, bg='#34495e')
        blocks_scrollbar = ttk.Scrollbar(blocks_frame, orient="vertical", command=blocks_canvas.yview)
        self.blocks_container = ttk.Frame(blocks_canvas)
        
        self.blocks_container.bind("<Configure>", 
                                  lambda e: blocks_canvas.configure(scrollregion=blocks_canvas.bbox("all")))
        
        blocks_canvas.create_window((0, 0), window=self.blocks_container, anchor="nw")
        blocks_canvas.configure(yscrollcommand=blocks_scrollbar.set)
        
        blocks_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        blocks_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Middle column - Deal construction area
        construction_frame = ttk.LabelFrame(blocks_container, text="🔨 Build Your Deal", padding=5)
        construction_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=5)
        
        # Current side indicator
        self.side_indicator = ttk.Label(construction_frame, text="Building for: You", 
                                       font=('Arial', 10, 'bold'), foreground='blue')
        self.side_indicator.pack(anchor=tk.W, pady=(0, 5))
        
        # Instructions
        ttk.Label(construction_frame, text="Click blocks to add advanced terms:", 
                 font=('Arial', 9, 'bold')).pack(anchor=tk.W, pady=(0, 5))
        
        # Construction area
        self.construction_canvas = tk.Canvas(construction_frame, bg='#2c3e50', height=250)
        self.construction_canvas.pack(fill=tk.BOTH, expand=True)
        
        # Right column - Block properties
        properties_frame = ttk.LabelFrame(blocks_container, text="⚙️ Block Settings", padding=5)
        properties_frame.pack(side=tk.RIGHT, fill=tk.Y, padx=(5, 0))
        
        self.block_settings_container = ttk.Frame(properties_frame)
        self.block_settings_container.pack(fill=tk.BOTH, expand=True)
        
        # Initial setup
        self.populate_property_lists()
        self.setup_available_blocks()
        self.create_available_blocks()
        
    def on_partner_selected(self, event=None):
        """Handle partner selection"""
        partner_name = self.partner_var.get()
        self.selected_partner = next((p for p in self.all_players if p.name == partner_name), None)
        self.populate_property_lists()
        self.setup_available_blocks()
        self.create_available_blocks()
        
        # Enable recipient radio button and update its text
        if self.selected_partner:
            self.recipient_radio.config(state='normal', text=f"🤝 {self.selected_partner.name}")
        else:
            self.recipient_radio.config(state='disabled', text="🤝 Trading Partner")
        
        # Update side indicator if on recipient side
        if self.current_side == "recipient":
            self.switch_side()
        
    def populate_property_lists(self):
        """Populate property checkboxes"""
        # Clear existing
        for widget in self.offer_properties_frame.winfo_children():
            widget.destroy()
        for widget in self.request_properties_frame.winfo_children():
            widget.destroy()
            
        # Your properties
        self.offer_property_vars = {}
        for prop in self.current_player.properties:
            var = tk.BooleanVar()
            self.offer_property_vars[prop.name] = var
            cb = ttk.Checkbutton(self.offer_properties_frame, text=prop.name, variable=var)
            cb.pack(anchor=tk.W)
            
        # Partner's properties (if selected)
        self.request_property_vars = {}
        if self.selected_partner:
            for prop in self.selected_partner.properties:
                var = tk.BooleanVar()
                self.request_property_vars[prop.name] = var
                cb = ttk.Checkbutton(self.request_properties_frame, text=prop.name, variable=var)
                cb.pack(anchor=tk.W)
                
    def switch_side(self):
        """Switch between proposer and recipient block building"""
        self.current_side = self.side_var.get()
        
        # Update side indicator
        if self.current_side == "proposer":
            self.side_indicator.config(text=f"Building for: {self.current_player.name} (You)", foreground='blue')
        else:
            partner_name = self.selected_partner.name if self.selected_partner else "Trading Partner"
            self.side_indicator.config(text=f"Building for: {partner_name}", foreground='green')
            
        # Update recipient radio button text
        partner_name = self.selected_partner.name if self.selected_partner else "Trading Partner"
        self.recipient_radio.config(text=f"🤝 {partner_name}")
        
        # Redraw construction area for current side
        self.redraw_construction_area()
                
    def get_current_trade_chain(self):
        """Get the trade chain for the currently selected side"""
        if self.current_side == "proposer":
            return self.proposer_trade_chain
        else:
            return self.recipient_trade_chain
            
    def get_current_block_variables(self):
        """Get the block variables for the currently selected side"""
        if self.current_side == "proposer":
            return self.proposer_block_variables
        else:
            return self.recipient_block_variables
                
    def setup_available_blocks(self):
        """Define all available function blocks organized by category"""
        self.available_blocks = {
            "🔄 Action Blocks": [
                {"type": "action", "name": "💰 I Pay You", "color": "#e74c3c", "variables": []},
                {"type": "action", "name": "💰 You Pay Me", "color": "#27ae60", "variables": []},
                {"type": "action", "name": "🏠 I Give Property", "color": "#3498db", "variables": []},
                {"type": "action", "name": "🏠 You Give Property", "color": "#f39c12", "variables": []},
                {"type": "action", "name": "🎯 We Share Rent", "color": "#9b59b6", "variables": []},
            ],
            
            "💡 Value Blocks": [
                {"type": "value", "name": "💵 $ Amount", "color": "#95a5a6", "variables": ["amount"]},
                {"type": "value", "name": "📊 % Percentage", "color": "#34495e", "variables": ["percentage"]},
                {"type": "value", "name": "🏠 My Property", "color": "#7f8c8d", "variables": ["my_property"]},
                {"type": "value", "name": "🏠 Your Property", "color": "#85929e", "variables": ["their_property"]},
                {"type": "value", "name": "🔢 Number of Turns", "color": "#2ecc71", "variables": ["turns"]},
            ],
            
            "⏱️ Timing Blocks": [
                {"type": "timing", "name": "🔄 Each Turn", "color": "#16a085", "variables": []},
                {"type": "timing", "name": "⏰ For X Turns", "color": "#2ecc71", "variables": ["turns"]},
                {"type": "timing", "name": "📅 Starting Turn X", "color": "#1abc9c", "variables": ["start_turn"]},
                {"type": "timing", "name": "⏳ Until Event", "color": "#f1c40f", "variables": []},
            ],
            
            "🎯 Condition Blocks": [
                {"type": "condition", "name": "📍 When You Land On", "color": "#e67e22", "variables": []},
                {"type": "condition", "name": "📍 When I Land On", "color": "#d35400", "variables": []},
                {"type": "condition", "name": "💸 When Rent Collected", "color": "#c0392b", "variables": []},
                {"type": "condition", "name": "🎲 When You Roll", "color": "#8e44ad", "variables": []},
                {"type": "condition", "name": "� If You Get Monopoly", "color": "#2980b9", "variables": []},
            ],
            
            "🔗 Logic Blocks": [
                {"type": "logic", "name": "➕ AND", "color": "#8e44ad", "variables": []},
                {"type": "logic", "name": "❓ OR", "color": "#d35400", "variables": []},
                {"type": "logic", "name": "▶️ THEN", "color": "#c0392b", "variables": []},
                {"type": "logic", "name": "🔄 ELSE", "color": "#a569bd", "variables": []},
            ]
        }
        
    def create_available_blocks(self):
        """Create visual blocks in the available blocks panel organized by category"""
        for widget in self.blocks_container.winfo_children():
            widget.destroy()
            
        for category_name, blocks in self.available_blocks.items():
            # Create category header
            category_frame = tk.Frame(self.blocks_container, bg='#2c3e50')
            category_frame.pack(fill=tk.X, pady=(10, 5))
            
            category_label = tk.Label(category_frame, text=category_name, 
                                    bg='#2c3e50', fg='#ecf0f1', 
                                    font=('Arial', 10, 'bold'))
            category_label.pack(anchor=tk.W)
            
            # Add separator line
            separator = tk.Frame(self.blocks_container, height=2, bg='#34495e')
            separator.pack(fill=tk.X, pady=(0, 5))
            
            # Create blocks in this category
            for block in blocks:
                block_frame = tk.Frame(self.blocks_container, bg=block["color"], 
                                     relief=tk.RAISED, bd=2, cursor="hand2")
                block_frame.pack(fill=tk.X, pady=2, padx=2)
                
                # Block label
                label = tk.Label(block_frame, text=block["name"], bg=block["color"], 
                               fg='white', font=('Arial', 9, 'bold'))
                label.pack(pady=5)
                
                # Add hover effects
                def on_enter(e, frame=block_frame, color=block["color"]):
                    darker_color = self.darken_color(color)
                    frame.config(bg=darker_color)
                    for child in frame.winfo_children():
                        if isinstance(child, tk.Label):
                            child.config(bg=darker_color)
                
                def on_leave(e, frame=block_frame, color=block["color"]):
                    frame.config(bg=color)
                    for child in frame.winfo_children():
                        if isinstance(child, tk.Label):
                            child.config(bg=color)
                
                block_frame.bind("<Enter>", on_enter)
                block_frame.bind("<Leave>", on_leave)
                
                # Add click handler to add block to construction area
                block_frame.bind("<Button-1>", lambda e, b=block: self.add_block_to_construction(b))
                label.bind("<Button-1>", lambda e, b=block: self.add_block_to_construction(b))
    
    def darken_color(self, hex_color):
        """Darken a hex color for hover effects"""
        # Remove the '#' if present
        hex_color = hex_color.lstrip('#')
        
        # Convert to RGB
        rgb = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
        
        # Darken by reducing each component
        darkened = tuple(max(0, int(c * 0.8)) for c in rgb)
        
        # Convert back to hex
        return f"#{darkened[0]:02x}{darkened[1]:02x}{darkened[2]:02x}"
            
    def add_block_to_construction(self, block_template):
        """Add a block to the construction area for the current side"""
        # Get current trade chain and variables
        current_chain = self.get_current_trade_chain()
        current_variables = self.get_current_block_variables()
        
        # Create new block instance
        new_block = block_template.copy()
        new_block["id"] = len(current_chain)
        new_block["x"] = 50
        new_block["y"] = 50 + (len(current_chain) * 60)
        
        # Initialize variables
        current_variables[new_block["id"]] = {}
        for var in new_block["variables"]:
            current_variables[new_block["id"]][var] = ""
            
        current_chain.append(new_block)
        self.redraw_construction_area()
        
    def redraw_construction_area(self):
        """Redraw all blocks in the construction area for the current side"""
        self.construction_canvas.delete("all")
        
        current_chain = self.get_current_trade_chain()
        current_variables = self.get_current_block_variables()
        
        for i, block in enumerate(current_chain):
            # Update block position based on index
            block["y"] = 50 + (i * 60)
            x, y = block["x"], block["y"]
            
            # Draw block rectangle
            rect = self.construction_canvas.create_rectangle(
                x, y, x + 180, y + 45, 
                fill=block["color"], outline='white', width=2
            )
            
            # Create block text with variables inline
            block_text = block["name"]
            if block["id"] in current_variables:
                vars_text = []
                for var, value in current_variables[block["id"]].items():
                    if value:
                        vars_text.append(f"{var}: {value}")
                if vars_text:
                    block_text += f" ({', '.join(vars_text)})"
            
            # Draw block text
            text = self.construction_canvas.create_text(
                x + 90, y + 22, text=block_text, 
                fill='white', font=('Arial', 8, 'bold'), width=170
            )
            
            # Add remove button
            remove_btn = self.construction_canvas.create_text(
                x + 165, y + 10, text="✕", 
                fill='#e74c3c', font=('Arial', 12, 'bold')
            )
            
            # Draw connection line to next block (if not last)
            if i < len(current_chain) - 1:
                self.construction_canvas.create_line(
                    x + 90, y + 45, x + 90, y + 65,
                    fill='#ecf0f1', width=3
                )
            
            # Add click handlers
            self.construction_canvas.tag_bind(rect, "<Button-1>", 
                                            lambda e, b=block: self.show_block_settings(b))
            self.construction_canvas.tag_bind(text, "<Button-1>", 
                                            lambda e, b=block: self.show_block_settings(b))
            self.construction_canvas.tag_bind(remove_btn, "<Button-1>", 
                                            lambda e, b=block: self.remove_block(b))
            
    def show_block_settings(self, block):
        """Show settings panel for selected block"""
        current_variables = self.get_current_block_variables()
        
        # Clear existing settings
        for widget in self.block_settings_container.winfo_children():
            widget.destroy()
            
        ttk.Label(self.block_settings_container, text=f"Settings for: {block['name']}", 
                 font=('Arial', 10, 'bold')).pack(anchor=tk.W, pady=(0, 10))
        
        # Create input fields for each variable
        for var in block["variables"]:
            var_frame = ttk.Frame(self.block_settings_container)
            var_frame.pack(fill=tk.X, pady=2)
            
            ttk.Label(var_frame, text=f"{var.replace('_', ' ').title()}:").pack(side=tk.LEFT)
            
            if var == "my_property":
                # Dropdown for current player's properties
                properties = [p.name for p in self.current_player.properties]
                var_widget = ttk.Combobox(var_frame, values=properties, state="readonly")
                var_widget.pack(side=tk.RIGHT)
                if block["id"] in current_variables and var in current_variables[block["id"]]:
                    var_widget.set(current_variables[block["id"]][var])
                var_widget.bind('<<ComboboxSelected>>', 
                               lambda e, b_id=block["id"], v=var: self.update_block_variable(b_id, v, e.widget.get()))
            elif var == "their_property":
                # Dropdown for partner's properties
                properties = [p.name for p in self.selected_partner.properties] if self.selected_partner else []
                var_widget = ttk.Combobox(var_frame, values=properties, state="readonly")
                var_widget.pack(side=tk.RIGHT)
                if block["id"] in current_variables and var in current_variables[block["id"]]:
                    var_widget.set(current_variables[block["id"]][var])
                var_widget.bind('<<ComboboxSelected>>', 
                               lambda e, b_id=block["id"], v=var: self.update_block_variable(b_id, v, e.widget.get()))
            else:
                # Text entry for other variables
                var_widget = ttk.Entry(var_frame)
                var_widget.pack(side=tk.RIGHT)
                if block["id"] in current_variables and var in current_variables[block["id"]]:
                    var_widget.insert(0, str(current_variables[block["id"]][var]))
                var_widget.bind('<KeyRelease>', 
                               lambda e, b_id=block["id"], v=var: self.update_block_variable(b_id, v, e.widget.get()))
        
        # Remove block button
        ttk.Button(self.block_settings_container, text="Remove Block", 
                  command=lambda: self.remove_block(block)).pack(pady=10)
                  
    def update_block_variable(self, block_id, variable, value):
        """Update a block's variable value"""
        current_variables = self.get_current_block_variables()
        if block_id not in current_variables:
            current_variables[block_id] = {}
        current_variables[block_id][variable] = value
        
        # Refresh the display to show the updated variable values
        self.redraw_construction_area()
        
    def remove_block(self, block):
        """Remove a block from the construction area and reindex remaining blocks"""
        current_chain = self.get_current_trade_chain()
        current_variables = self.get_current_block_variables()
        
        # Find the index of the block to remove
        block_index = next((i for i, b in enumerate(current_chain) if b["id"] == block["id"]), -1)
        if block_index == -1:
            return
            
        # Remove the block
        current_chain.pop(block_index)
        
        # Remove block variables
        if block["id"] in current_variables:
            del current_variables[block["id"]]
        
        # Reindex remaining blocks and update their IDs
        new_block_variables = {}
        for i, remaining_block in enumerate(current_chain):
            old_id = remaining_block["id"]
            new_id = i
            remaining_block["id"] = new_id
            
            # Move variables to new ID
            if old_id in current_variables:
                new_block_variables[new_id] = current_variables[old_id]
        
        # Update block variables dictionary
        current_variables.clear()
        current_variables.update(new_block_variables)
        
        # Redraw everything
        self.redraw_construction_area()
        
        # Clear settings panel
        for widget in self.block_settings_container.winfo_children():
            widget.destroy()
    
    def setup_summary_tab(self):
        """Deal summary and execution tab"""
        # Summary text area
        summary_frame = ttk.Frame(self.summary_frame)
        summary_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        ttk.Label(summary_frame, text="Complete Deal Summary:", 
                 font=('Arial', 12, 'bold')).pack(anchor=tk.W, pady=(0, 10))
        
        self.summary_text = tk.Text(summary_frame, height=20, wrap=tk.WORD,
                                   bg='#34495e', fg='#ecf0f1', font=('Arial', 10))
        summary_scroll = ttk.Scrollbar(summary_frame, orient="vertical", command=self.summary_text.yview)
        
        self.summary_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        summary_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.summary_text.configure(yscrollcommand=summary_scroll.set)
        
        # Buttons
        button_frame = ttk.Frame(self.summary_frame)
        button_frame.pack(fill=tk.X, padx=10, pady=10)
        
        ttk.Button(button_frame, text="Refresh Summary", 
                  command=self.update_deal_summary).pack(side=tk.LEFT, padx=(0, 10))
        
        ttk.Button(button_frame, text="Propose Deal", 
                  command=self.propose_advanced_deal).pack(side=tk.LEFT, padx=(0, 10))
        
        ttk.Button(button_frame, text="Cancel", 
                  command=self.dialog.destroy).pack(side=tk.RIGHT)
                  
    def update_deal_summary(self):
        """Update the deal summary text"""
        self.summary_text.delete(1.0, tk.END)
        
        summary = "ADVANCED TRADE PROPOSAL\n"
        summary += "=" * 50 + "\n\n"
        
        if self.selected_partner:
            summary += f"Between: {self.current_player.name} and {self.selected_partner.name}\n\n"
        
        # Traditional trading summary
        summary += "TRADITIONAL EXCHANGE:\n"
        summary += "-" * 20 + "\n"
        
        # Properties offered
        offered_props = [name for name, var in getattr(self, 'offer_property_vars', {}).items() if var.get()]
        if offered_props:
            summary += f"{self.current_player.name} offers properties: {', '.join(offered_props)}\n"
            
        # Money offered
        offered_money = self.offer_money_var.get() if hasattr(self, 'offer_money_var') else "0"
        if offered_money and offered_money != "0":
            summary += f"{self.current_player.name} offers cash: ${offered_money}\n"
            
        # Properties requested
        requested_props = [name for name, var in getattr(self, 'request_property_vars', {}).items() if var.get()]
        if requested_props:
            summary += f"{self.current_player.name} requests properties: {', '.join(requested_props)}\n"
            
        # Money requested
        requested_money = self.request_money_var.get() if hasattr(self, 'request_money_var') else "0"
        if requested_money and requested_money != "0":
            summary += f"{self.current_player.name} requests cash: ${requested_money}\n"
            
        if not (offered_props or requested_props or (offered_money and offered_money != "0") or (requested_money and requested_money != "0")):
            summary += "No traditional exchange specified.\n"
            
        # Function blocks summary for proposer
        summary += f"\nADVANCED TERMS FROM {self.current_player.name.upper()}:\n"
        summary += "-" * 20 + "\n"
        
        if self.proposer_trade_chain:
            for i, block in enumerate(self.proposer_trade_chain):
                block_text = f"{i+1}. {block['name']}"
                if block["id"] in self.proposer_block_variables:
                    for var, value in self.proposer_block_variables[block["id"]].items():
                        if value:
                            block_text += f" [{var}: {value}]"
                summary += block_text + "\n"
        else:
            summary += "No advanced terms specified.\n"
            
        # Function blocks summary for recipient
        if self.selected_partner:
            summary += f"\nADVANCED TERMS FROM {self.selected_partner.name.upper()}:\n"
            summary += "-" * 20 + "\n"
            
            if self.recipient_trade_chain:
                for i, block in enumerate(self.recipient_trade_chain):
                    block_text = f"{i+1}. {block['name']}"
                    if block["id"] in self.recipient_block_variables:
                        for var, value in self.recipient_block_variables[block["id"]].items():
                            if value:
                                block_text += f" [{var}: {value}]"
                    summary += block_text + "\n"
            else:
                summary += "No advanced terms specified.\n"
            
        self.summary_text.insert(1.0, summary)
        
    def propose_advanced_deal(self):
        """Propose the advanced deal"""
        if not self.selected_partner:
            messagebox.showerror("Error", "Please select a trading partner first.")
            return
            
        # Create advanced trade object (would need to extend the Trade class)
        try:
            # Collect traditional trading data
            offered_props = [name for name, var in getattr(self, 'offer_property_vars', {}).items() if var.get()]
            requested_props = [name for name, var in getattr(self, 'request_property_vars', {}).items() if var.get()]
            offered_money = int(self.offer_money_var.get() or "0")
            requested_money = int(self.request_money_var.get() or "0")
            
            # For now, create a basic trade and add function blocks as metadata
            from trading import Trade
            
            # Convert property names to property objects
            offered_property_objects = []
            for prop_name in offered_props:
                prop = next((p for p in self.current_player.properties if p.name == prop_name), None)
                if prop:
                    offered_property_objects.append(prop)
                    
            requested_property_objects = []
            for prop_name in requested_props:
                prop = next((p for p in self.selected_partner.properties if p.name == prop_name), None)
                if prop:
                    requested_property_objects.append(prop)
            
            trade = Trade(
                self.current_player, 
                self.selected_partner,
                offered_property_objects,
                requested_property_objects, 
                offered_money,
                requested_money
            )
            
            # Add bilateral function blocks as metadata
            trade.proposer_blocks = self.proposer_trade_chain.copy()
            trade.proposer_block_variables = self.proposer_block_variables.copy()
            trade.recipient_blocks = self.recipient_trade_chain.copy()
            trade.recipient_block_variables = self.recipient_block_variables.copy()
            
            # Add to pending trades
            self.game.add_pending_trade(trade)
            
            messagebox.showinfo("Success", f"Advanced trade proposal sent to {self.selected_partner.name}!")
            self.dialog.destroy()
            
        except ValueError as e:
            messagebox.showerror("Error", "Please enter valid numbers for money amounts.")
        except Exception as e:
            messagebox.showerror("Error", f"Failed to create trade: {str(e)}")

def open_advanced_trade_dialog(parent, current_player, all_players, game):
    """Open the advanced trade dialog"""
    dialog = AdvancedTradingDialog(parent, current_player, all_players, game)
    return dialog
