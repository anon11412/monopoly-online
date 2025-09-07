"""
Super Simple Enhanced Trading - Just 2 Function Blocks

This is a minimal implementation with just the essential parts:
1. Traditional trading (properties + money)
2. 2 Function blocks: Pay Money + For X Turns
3. Direct integration with game
"""

import tkinter as tk
from tkinter import ttk, messagebox, simpledialog
from trading import Trade

class SuperSimpleEnhancedDialog:
    """Super simple enhanced trading with just 2 blocks"""
    
    def __init__(self, parent, current_player, partner, game):
        self.parent = parent
        self.current_player = current_player
        self.partner = partner
        self.game = game
        
        # Traditional trade data
        self.offered_properties = []
        self.requested_properties = []
        self.offered_money = 0
        self.requested_money = 0
        
        # Function blocks data - just 2 simple blocks
        self.my_blocks = []  # Blocks I will execute (pay money to partner)
        self.partner_blocks = []  # Blocks partner will execute (pay money to me)
        
        self.create_dialog()
    
    def create_dialog(self):
        """Create the dialog window"""
        self.dialog = tk.Toplevel(self.parent)
        self.dialog.title(f"Enhanced Trade with {self.partner.name}")
        self.dialog.geometry("800x600")
        self.dialog.resizable(True, True)
        
        # Center dialog
        self.center_dialog()
        
        # Create interface
        self.create_interface()
    
    def center_dialog(self):
        """Center the dialog on screen"""
        self.dialog.update_idletasks()
        width = self.dialog.winfo_width()
        height = self.dialog.winfo_height()
        x = (self.dialog.winfo_screenwidth() // 2) - (width // 2)
        y = (self.dialog.winfo_screenheight() // 2) - (height // 2)
        self.dialog.geometry(f'{width}x{height}+{x}+{y}')
    
    def create_interface(self):
        """Create the main interface"""
        main_frame = ttk.Frame(self.dialog)
        main_frame.pack(fill='both', expand=True, padx=10, pady=10)
        
        # Title
        title_label = ttk.Label(main_frame, 
                               text=f"Enhanced Trade: {self.current_player.name} ↔ {self.partner.name}",
                               font=('Arial', 14, 'bold'))
        title_label.pack(pady=(0, 10))
        
        # Create notebook with tabs
        notebook = ttk.Notebook(main_frame)
        notebook.pack(fill='both', expand=True)
        
        # Tab 1: Traditional Trading
        traditional_frame = ttk.Frame(notebook)
        notebook.add(traditional_frame, text="Traditional Trade")
        self.create_traditional_tab(traditional_frame)
        
        # Tab 2: Function Blocks
        blocks_frame = ttk.Frame(notebook)
        notebook.add(blocks_frame, text="Function Blocks")
        self.create_blocks_tab(blocks_frame)
        
        # Control buttons
        self.create_control_buttons(main_frame)
    
    def create_traditional_tab(self, parent):
        """Create traditional trading interface"""
        # Two columns
        columns_frame = ttk.Frame(parent)
        columns_frame.pack(fill='both', expand=True, padx=10, pady=10)
        
        # Left column - What I offer
        left_frame = ttk.LabelFrame(columns_frame, text=f"{self.current_player.name} Offers")
        left_frame.pack(side='left', fill='both', expand=True, padx=(0, 5))
        
        # Offered money
        ttk.Label(left_frame, text="Money:").pack(anchor='w', padx=5, pady=2)
        self.offered_money_var = tk.StringVar(value="0")
        ttk.Entry(left_frame, textvariable=self.offered_money_var, width=10).pack(anchor='w', padx=5, pady=2)
        
        # Offered properties
        ttk.Label(left_frame, text="Properties:").pack(anchor='w', padx=5, pady=(10, 2))
        self.offered_props_frame = ttk.Frame(left_frame)
        self.offered_props_frame.pack(fill='both', expand=True, padx=5, pady=2)
        self.populate_offered_properties()
        
        # Right column - What I want
        right_frame = ttk.LabelFrame(columns_frame, text=f"{self.current_player.name} Wants")
        right_frame.pack(side='right', fill='both', expand=True, padx=(5, 0))
        
        # Requested money
        ttk.Label(right_frame, text="Money:").pack(anchor='w', padx=5, pady=2)
        self.requested_money_var = tk.StringVar(value="0")
        ttk.Entry(right_frame, textvariable=self.requested_money_var, width=10).pack(anchor='w', padx=5, pady=2)
        
        # Requested properties
        ttk.Label(right_frame, text="Properties:").pack(anchor='w', padx=5, pady=(10, 2))
        self.requested_props_frame = ttk.Frame(right_frame)
        self.requested_props_frame.pack(fill='both', expand=True, padx=5, pady=2)
        self.populate_requested_properties()
    
    def create_blocks_tab(self, parent):
        """Create function blocks interface"""
        info_label = ttk.Label(parent, 
                              text="Function Blocks: Create recurring payments using 2 simple blocks",
                              font=('Arial', 11, 'bold'))
        info_label.pack(pady=10)
        
        # Two sections
        sections_frame = ttk.Frame(parent)
        sections_frame.pack(fill='both', expand=True, padx=10, pady=10)
        
        # Left: My payments to partner
        left_frame = ttk.LabelFrame(sections_frame, text=f"{self.current_player.name} will pay {self.partner.name}")
        left_frame.pack(side='left', fill='both', expand=True, padx=(0, 5))
        
        self.create_payment_setup(left_frame, "my")
        
        # Right: Partner payments to me
        right_frame = ttk.LabelFrame(sections_frame, text=f"{self.partner.name} will pay {self.current_player.name}")
        right_frame.pack(side='right', fill='both', expand=True, padx=(5, 0))
        
        self.create_payment_setup(right_frame, "partner")
    
    def create_payment_setup(self, parent, payment_type):
        """Create payment setup interface"""
        # Amount input
        ttk.Label(parent, text="💰 Amount per turn:").pack(anchor='w', padx=5, pady=5)
        amount_var = tk.StringVar(value="100")
        amount_entry = ttk.Entry(parent, textvariable=amount_var, width=10)
        amount_entry.pack(anchor='w', padx=5, pady=2)
        
        # Turns input
        ttk.Label(parent, text="🔄 Number of turns:").pack(anchor='w', padx=5, pady=(10, 5))
        turns_var = tk.StringVar(value="5")
        turns_entry = ttk.Entry(parent, textvariable=turns_var, width=10)
        turns_entry.pack(anchor='w', padx=5, pady=2)
        
        # Add button
        def add_payment():
            try:
                amount = int(amount_var.get())
                turns = int(turns_var.get())
                
                if amount <= 0 or turns <= 0:
                    messagebox.showerror("Error", "Amount and turns must be positive numbers")
                    return
                
                # Create the payment
                payment_data = {
                    'amount': amount,
                    'turns': turns,
                    'description': f"${amount} per turn for {turns} turns"
                }
                
                if payment_type == "my":
                    self.my_blocks = [payment_data]  # Only one payment at a time
                    payer = self.current_player.name
                    receiver = self.partner.name
                else:
                    self.partner_blocks = [payment_data]
                    payer = self.partner.name
                    receiver = self.current_player.name
                
                # Update display
                self.update_payment_display(parent, payment_data, payment_type)
                
                messagebox.showinfo("Added", f"Payment added: {payer} → {receiver}\n{payment_data['description']}")
                
            except ValueError:
                messagebox.showerror("Error", "Please enter valid numbers")
        
        add_btn = ttk.Button(parent, text="Add Payment", command=add_payment)
        add_btn.pack(pady=10)
        
        # Display area
        display_frame = ttk.Frame(parent)
        display_frame.pack(fill='both', expand=True, padx=5, pady=5)
        
        # Store references for updating
        if payment_type == "my":
            self.my_display_frame = display_frame
        else:
            self.partner_display_frame = display_frame
    
    def update_payment_display(self, parent, payment_data, payment_type):
        """Update the payment display"""
        display_frame = self.my_display_frame if payment_type == "my" else self.partner_display_frame
        
        # Clear existing
        for widget in display_frame.winfo_children():
            widget.destroy()
        
        if payment_data:
            payment_label = ttk.Label(display_frame, 
                                    text=f"💰 {payment_data['description']}",
                                    background='lightgreen')
            payment_label.pack(pady=5)
            
            def remove_payment():
                if payment_type == "my":
                    self.my_blocks = []
                else:
                    self.partner_blocks = []
                self.update_payment_display(parent, None, payment_type)
            
            remove_btn = ttk.Button(display_frame, text="Remove", command=remove_payment)
            remove_btn.pack()
    
    def populate_offered_properties(self):
        """Populate offered properties checkboxes"""
        self.offered_prop_vars = {}
        
        for prop in self.current_player.properties:
            var = tk.BooleanVar()
            self.offered_prop_vars[prop] = var
            
            cb = ttk.Checkbutton(self.offered_props_frame, 
                               text=f"{prop.name} (${prop.price})",
                               variable=var)
            cb.pack(anchor='w', padx=5, pady=1)
    
    def populate_requested_properties(self):
        """Populate requested properties checkboxes"""
        self.requested_prop_vars = {}
        
        for prop in self.partner.properties:
            var = tk.BooleanVar()
            self.requested_prop_vars[prop] = var
            
            cb = ttk.Checkbutton(self.requested_props_frame,
                               text=f"{prop.name} (${prop.price})",
                               variable=var)
            cb.pack(anchor='w', padx=5, pady=1)
    
    def create_control_buttons(self, parent):
        """Create control buttons"""
        button_frame = ttk.Frame(parent)
        button_frame.pack(fill='x', pady=10)
        
        ttk.Button(button_frame, text="Clear All", 
                  command=self.clear_all).pack(side='left', padx=5)
        
        ttk.Button(button_frame, text="Cancel", 
                  command=self.dialog.destroy).pack(side='right', padx=5)
        
        ttk.Button(button_frame, text="Propose Trade", 
                  command=self.propose_trade).pack(side='right', padx=5)
    
    def clear_all(self):
        """Clear all trade data"""
        self.offered_money_var.set("0")
        self.requested_money_var.set("0")
        
        for var in self.offered_prop_vars.values():
            var.set(False)
        for var in self.requested_prop_vars.values():
            var.set(False)
        
        self.my_blocks = []
        self.partner_blocks = []
        
        # Clear displays
        for widget in self.my_display_frame.winfo_children():
            widget.destroy()
        for widget in self.partner_display_frame.winfo_children():
            widget.destroy()
    
    def propose_trade(self):
        """Propose the trade"""
        try:
            # Get traditional trade data
            offered_money = int(self.offered_money_var.get() or "0")
            requested_money = int(self.requested_money_var.get() or "0")
            
            offered_properties = [prop for prop, var in self.offered_prop_vars.items() if var.get()]
            requested_properties = [prop for prop, var in self.requested_prop_vars.items() if var.get()]
            
            # Create trade
            trade = SuperSimpleEnhancedTrade(
                proposer=self.current_player,
                recipient=self.partner,
                offered_properties=offered_properties,
                requested_properties=requested_properties,
                offered_money=offered_money,
                requested_money=requested_money,
                my_blocks=self.my_blocks,
                partner_blocks=self.partner_blocks
            )
            
            # Add to pending trades
            self.game.add_pending_trade(trade)
            
            messagebox.showinfo("Trade Proposed", 
                              f"Super Simple Enhanced trade proposed to {self.partner.name}!")
            self.dialog.destroy()
            
        except Exception as e:
            messagebox.showerror("Error", f"Failed to propose trade: {e}")


class SuperSimpleEnhancedTrade(Trade):
    """Enhanced trade with super simple function blocks"""
    
    def __init__(self, proposer, recipient, offered_properties, requested_properties,
                 offered_money, requested_money, my_blocks=None, partner_blocks=None):
        super().__init__(proposer, recipient, offered_properties, requested_properties,
                        offered_money, requested_money)
        
        self.my_blocks = my_blocks or []
        self.partner_blocks = partner_blocks or []
    
    def has_function_blocks(self):
        """Check if this trade has function blocks"""
        return bool(self.my_blocks or self.partner_blocks)
    
    def get_summary(self):
        """Get enhanced trade summary"""
        summary = super().get_summary()
        
        if self.my_blocks:
            summary += f"\n\n{self.proposer.name}'s Payments:"
            for block in self.my_blocks:
                summary += f"\n  💰 {block['description']}"
        
        if self.partner_blocks:
            summary += f"\n\n{self.recipient.name}'s Payments:"
            for block in self.partner_blocks:
                summary += f"\n  💰 {block['description']}"
        
        return summary


def open_super_simple_enhanced_dialog(parent, current_player, partner, game):
    """Open the super simple enhanced trading dialog"""
    dialog = SuperSimpleEnhancedDialog(parent, current_player, partner, game)
    return dialog
