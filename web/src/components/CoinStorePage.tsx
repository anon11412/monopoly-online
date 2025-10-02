import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Elements, CardElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { StripeElementsOptions } from '@stripe/stripe-js';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { getStripePromise, processRealPayment } from '../lib/payments';
import type { PaymentResult } from '../lib/payments';
import { ensureApiSession } from '../lib/session';

interface CoinStorePageProps {
  onBack?: () => void;
  onBalanceChange?: (goldCoins: number) => void;
}

interface CoinPackage {
  id: string;
  name: string;
  coins: number;
  price_usd: number;
  bonus: number;
  popular: boolean;
  description: string;
}

interface PaymentTransaction {
  id: string;
  package_id: string;
  coins: number;
  coin_type?: string;
  amount_usd: number;
  status: string;
  created_at: number;
  completed_at?: number;
}

interface CheckoutModalProps {
  pkg: CoinPackage;
  onClose: () => void;
  onSuccess: (result: PaymentResult) => void;
}

const CheckoutModal: React.FC<CheckoutModalProps> = ({ pkg, onClose, onSuccess }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      setErrorMessage('Payment form is still loading. Please try again in a moment.');
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setErrorMessage('Unable to access card details. Please refresh and try again.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    const result = await processRealPayment(pkg.id, cardElement);

    if (result.success) {
      cardElement.clear();
      onSuccess(result);
    } else {
      setErrorMessage(result.error || 'Payment failed. Please try again.');
    }

    setIsProcessing(false);
  };

  const handleOverlayClick = () => {
    if (!isProcessing) {
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(17, 24, 39, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(2px)'
      }}
      onClick={handleOverlayClick}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          padding: '32px 28px',
          borderRadius: 16,
          boxShadow: '0 20px 45px rgba(15, 23, 42, 0.35)',
          width: 'min(420px, 90vw)',
          border: '1px solid var(--color-border)'
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 20 }}>
          <div>
            <div className="ui-xs" style={{ opacity: 0.7, letterSpacing: 1 }}>CHECKOUT</div>
            <div className="ui-h2" style={{ marginTop: 8 }}>{pkg.name}</div>
            <div className="ui-sm" style={{ opacity: 0.7, marginTop: 4 }}>
              {pkg.coins.toLocaleString()} coins for ${(pkg.price_usd / 100).toFixed(2)}
            </div>
          </div>
          <button
            className="btn btn-ghost"
            style={{ padding: '4px 8px' }}
            onClick={() => !isProcessing && onClose()}
            disabled={isProcessing}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <div className="ui-xs" style={{ marginBottom: 8, opacity: 0.75 }}>Card Details</div>
            <div
              style={{
                background: 'var(--color-surface-alt)',
                border: '1px solid var(--color-border)',
                borderRadius: 12,
                padding: '14px 16px'
              }}
            >
              <CardElement
                options={{
                  style: {
                    base: {
                      iconColor: 'var(--color-text-muted)',
                      color: 'var(--color-text)',
                      fontWeight: '500',
                      fontFamily: '"Inter", "Segoe UI", sans-serif',
                      fontSize: '15px',
                      '::placeholder': {
                        color: 'var(--color-text-muted)'
                      }
                    },
                    invalid: {
                      color: '#f04438'
                    }
                  },
                  hidePostalCode: true
                }}
                onChange={(event) => {
                  setErrorMessage(event.error?.message || null);
                  setCardComplete(event.complete);
                }}
              />
            </div>
          </div>

          {errorMessage && (
            <div
              className="ui-xs"
              style={{
                background: 'rgba(240, 68, 56, 0.1)',
                color: '#f04438',
                borderRadius: 8,
                padding: '10px 12px',
                marginBottom: 16
              }}
            >
              {errorMessage}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 24
            }}
          >
            <div>
              <div className="ui-xs" style={{ opacity: 0.7 }}>Total Due</div>
              <div className="ui-h1" style={{ fontSize: 24 }}>${(pkg.price_usd / 100).toFixed(2)}</div>
            </div>
            <div className="ui-xs" style={{ textAlign: 'right', opacity: 0.7 }}>
              Powered securely by Stripe
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ flex: 1, padding: '12px 0' }}
              onClick={() => !isProcessing && onClose()}
              disabled={isProcessing}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 2, padding: '12px 0' }}
              disabled={isProcessing || !cardComplete}
            >
              {isProcessing ? 'Processing…' : `Pay ${(pkg.price_usd / 100).toFixed(2)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const CoinStorePage: React.FC<CoinStorePageProps> = ({ onBack, onBalanceChange }) => {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [packages, setPackages] = useState<CoinPackage[]>([]);
  const [userGoldCoins, setUserGoldCoins] = useState(0);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'store' | 'history'>('store');
  const [purchaseLoading, setPurchaseLoading] = useState<string | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<CoinPackage | null>(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const stripePromise = getStripePromise();

  const applyBalance = useCallback((balance: number) => {
    setUserGoldCoins(balance);
    if (onBalanceChange) {
      onBalanceChange(balance);
    }
  }, [onBalanceChange]);
  const elementsOptions = useMemo<StripeElementsOptions>(
    () => ({
      appearance: { theme: (theme === 'light' ? 'stripe' : 'night') as 'stripe' | 'night' }
    }),
    [theme]
  );

  useEffect(() => {
    setIsLoading(true);
    const loadStoreData = async () => {
      try {
        await ensureApiSession(user?.name);

        // Load coin packages
        const packagesResponse = await fetch('/api/store/packages');
        if (packagesResponse.ok) {
          const packagesData = await packagesResponse.json();
          setPackages(packagesData);
        }

        // Load user stats for coin balance
        const statsResponse = await fetch('/api/user/stats', { credentials: 'include' });
        if (statsResponse.ok) {
          const stats = await statsResponse.json();
          applyBalance(stats.gold_coins ?? stats.coins ?? 0);
        } else if (statsResponse.status === 401) {
          const sessionOk = await ensureApiSession(user?.name);
          if (sessionOk) {
            const retryStats = await fetch('/api/user/stats', { credentials: 'include' });
            if (retryStats.ok) {
              const stats = await retryStats.json();
              applyBalance(stats.gold_coins ?? stats.coins ?? 0);
            }
          }
        }

        // Load transaction history
        const historyResponse = await fetch('/api/payments/history', { credentials: 'include' });
        if (historyResponse.ok) {
          const historyData = await historyResponse.json();
          setTransactions(historyData);
        } else if (historyResponse.status === 401) {
          const sessionOk = await ensureApiSession(user?.name);
          if (sessionOk) {
            const retryHistory = await fetch('/api/payments/history', { credentials: 'include' });
            if (retryHistory.ok) {
              const historyData = await retryHistory.json();
              setTransactions(historyData);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load store data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStoreData();
  }, [applyBalance, user?.name]);

  const handlePurchase = async (pkg: CoinPackage) => {
    setPurchaseLoading(pkg.id);

    try {
      const sessionOk = await ensureApiSession(user?.name);
      if (!sessionOk) {
        alert('❌ Purchase Failed\n\nWe could not verify your session. Please sign in again and retry.');
        return;
      }

      if (!stripePromise) {
        console.error('Stripe publishable key is missing or invalid; cannot start checkout.');
        alert('Payments are currently unavailable. Please contact support.');
        return;
      }

      const stripe = await stripePromise;
      if (!stripe) {
        console.error('Stripe failed to initialize on the client; cannot start checkout.');
        alert('Payments are currently unavailable. Please refresh and try again.');
        return;
      }

      setSelectedPackage(pkg);
      setShowCheckoutModal(true);
    } catch (error) {
      console.error('Unable to initiate purchase:', error);
      alert('❌ Purchase Failed\n\nNetwork error occurred. Please check your connection and try again.');
    } finally {
      setPurchaseLoading(null);
    }
  };

  const handleModalClose = () => {
    setShowCheckoutModal(false);
    setSelectedPackage(null);
  };

  const handlePaymentSuccess = async (result: PaymentResult) => {
    handleModalClose();
    const updatedBalance = result.new_balance ?? userGoldCoins;
    applyBalance(updatedBalance);

    try {
      const historyResponse = await fetch('/api/payments/history', { credentials: 'include' });
      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        setTransactions(historyData);
      }
    } catch (error) {
      console.error('Failed to refresh payment history:', error);
    }

    try {
      const statsResponse = await fetch('/api/user/stats', { credentials: 'include' });
      if (statsResponse.ok) {
        const stats = await statsResponse.json();
        applyBalance(stats.gold_coins ?? stats.coins ?? 0);
      }
    } catch (error) {
      console.error('Failed to refresh user stats:', error);
    }

    const coinsAddedText = result.coins_added
      ? `Added ${result.coins_added} gold coins to your account!`
      : 'Your purchase has been applied to your account!';
    const balanceText = `New gold balance: ${(result.new_balance ?? updatedBalance) ?? 'N/A'} coins`;
    const transactionLine = result.transaction_id ? `\nTransaction ID: ${result.transaction_id}` : '';

    alert(`🎉 Purchase Successful!\n\n${coinsAddedText}\n${balanceText}${transactionLine}`);
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  const renderStore = () => (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Current Balance */}
      <div className="ui-labelframe elev-2" style={{ 
        padding: 20, 
        marginBottom: 24
      }}>
        <div className="ui-title">
          Your Coin Balance
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>�</span>
            <span className="ui-h1" style={{ fontSize: 24 }}>{userGoldCoins} gold coins</span>
          </div>
          <div className="ui-xs" style={{ opacity: 0.7 }}>
            Silver coins are earned from victories and displayed on your profile
          </div>
        </div>
        <div className="ui-sm" style={{ opacity: 0.8, marginTop: 8 }}>
          Purchase more gold coins to unlock premium features and customizations
        </div>
      </div>

      {/* Coin Packages */}
      {!stripePromise && (
        <div
          className="ui-labelframe elev-1"
          style={{
            marginBottom: 24,
            border: '1px solid rgba(240, 68, 56, 0.3)',
            background: 'rgba(240, 68, 56, 0.08)',
            color: '#f04438',
            padding: 16
          }}
        >
          <div className="ui-title" style={{ color: '#f04438' }}>Payments Disabled</div>
          <div className="ui-xs" style={{ marginTop: 8, lineHeight: 1.4 }}>
            A valid Stripe publishable key is required to collect card payments. Update your environment configuration and refresh the page to enable checkout.
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {packages.map((pkg) => (
          <div 
            key={pkg.id} 
            className="ui-labelframe elev-2" 
            style={{ 
              padding: 20,
              position: 'relative'
            }}
          >
            {pkg.popular && (
              <div style={{
                position: 'absolute',
                top: -8,
                right: 16,
                background: 'var(--color-surface-alt)',
                color: 'var(--color-text)',
                padding: '4px 12px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 'bold',
                border: '1px solid var(--color-border)'
              }}>
                MOST POPULAR
              </div>
            )}
            
            <div className="ui-title">{pkg.name}</div>
            
            <div style={{ marginTop: 16, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>🪙</span>
                <span className="ui-h1" style={{ fontSize: 18 }}>
                  {pkg.coins.toLocaleString()} coins
                </span>
                {pkg.bonus > 0 && (
                  <span style={{ 
                    background: 'var(--color-success)', 
                    color: 'white', 
                    padding: '2px 6px', 
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 'bold'
                  }}>
                    +{pkg.bonus} BONUS
                  </span>
                )}
              </div>
              
              <div className="ui-h1" style={{ fontSize: 20, marginBottom: 8 }}>
                {formatPrice(pkg.price_usd)}
              </div>
              
              <div className="ui-sm" style={{ opacity: 0.8, marginBottom: 16 }}>
                {pkg.description}
              </div>
              
              {pkg.bonus > 0 && (
                <div className="ui-xs" style={{ 
                  color: 'var(--color-success)', 
                  marginBottom: 16,
                  fontWeight: 'bold'
                }}>
                  Total: {(pkg.coins + pkg.bonus).toLocaleString()} coins 
                  ({Math.round((pkg.bonus / pkg.coins) * 100)}% bonus!)
                </div>
              )}
            </div>
            
            <button
              onClick={() => handlePurchase(pkg)}
              disabled={!stripePromise || purchaseLoading === pkg.id}
              className={pkg.popular ? 'btn btn-primary' : 'btn btn-success'}
              style={{ 
                width: '100%',
                padding: '12px',
                ...((!stripePromise || purchaseLoading === pkg.id) ? { opacity: 0.7, cursor: !stripePromise ? 'not-allowed' : 'wait' } : {})
              }}
            >
              {!stripePromise ? 'Payments unavailable' : purchaseLoading === pkg.id ? '⏳ Processing...' : `Purchase ${pkg.name}`}
            </button>
          </div>
        ))}
      </div>

      {/* Payment Info */}
      <div className="ui-labelframe elev-1" style={{ 
        marginTop: 32,
        background: 'var(--color-warning)', 
        color: 'var(--ui-dark)',
        border: '1px solid rgba(243, 156, 18, 0.3)'
      }}>
        <div className="ui-title" style={{ color: 'var(--ui-dark)', background: 'var(--color-warning)' }}>
          💳 Payment Information
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div className="ui-sm">• Secure payments powered by Stripe</div>
            <div className="ui-sm">• All major credit cards accepted</div>
            <div className="ui-sm">• Coins are delivered instantly</div>
            <div className="ui-sm">• 30-day money-back guarantee</div>
            <div className="ui-sm">• Customer support available 24/7</div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderHistory = () => (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="ui-labelframe elev-2" style={{ padding: 20 }}>
        <div className="ui-title">Transaction History</div>
        
        {transactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💳</div>
            <div className="ui-h2" style={{ marginBottom: 8 }}>No purchases yet</div>
            <div className="ui-sm" style={{ opacity: 0.7 }}>
              Your coin purchase history will appear here
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 16 }}>
            {transactions.map((transaction) => {
              const pkg = packages.find(p => p.id === transaction.package_id);
              const isSilver = (transaction.coin_type || 'gold') === 'silver';
              const coinLabel = isSilver ? 'silver coins' : 'gold coins';
              const coinIcon = isSilver ? '🥈' : '🥇';
              return (
                <div 
                  key={transaction.id}
                  className="ui-labelframe"
                  style={{ 
                    padding: 16, 
                    marginBottom: 12,
                    background: transaction.status === 'completed' ? 
                      'var(--color-surface-alt)' : 
                      'rgba(243, 156, 18, 0.1)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                      <div className="ui-h3" style={{ marginBottom: 4 }}>
                        {pkg?.name || 'Unknown Package'}
                      </div>
                      <div className="ui-sm" style={{ opacity: 0.8, marginBottom: 8 }}>
                        {transaction.coins.toLocaleString()} {coinLabel} • {formatDate(transaction.created_at)}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className={`badge ${transaction.status === 'completed' ? 'badge-success' : 'badge-muted'}`}>
                          {transaction.status.toUpperCase()}
                        </span>
                        <span className="ui-h3">{formatPrice(transaction.amount_usd)}</span>
                      </div>
                    </div>
                    
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 16 }}>{coinIcon}</span>
                        <span className="ui-h2">{transaction.coins.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'var(--color-bg)',
      color: 'var(--color-text)',
      fontFamily: 'Arial, Helvetica, sans-serif'
    }}>
      {/* Header */}
      <div style={{ 
        background: 'var(--color-surface)', 
        borderBottom: '1px solid var(--color-border)',
        boxShadow: 'var(--elev-1)'
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {onBack && (
                <button 
                  onClick={onBack}
                  className="btn btn-ghost"
                  style={{ padding: '8px 12px' }}
                >
                  ← Back to Profile
                </button>
              )}
              <div className="ui-h1" style={{ fontSize: 20 }}>
                Coin Store
              </div>
            </div>
            <button 
              onClick={toggleTheme}
              className="btn btn-ghost"
              style={{ padding: '8px 12px' }}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ 
        background: 'var(--color-surface)', 
        borderBottom: '1px solid var(--color-border)' 
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px' }}>
          <div style={{ display: 'flex', gap: 32 }}>
            {[
              { id: 'store', name: 'Coin Store', icon: '🛒' },
              { id: 'history', name: 'Purchase History', icon: '📜' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '16px 8px',
                  borderBottom: activeTab === tab.id ? '2px solid var(--color-accent)' : '2px solid transparent',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: activeTab === tab.id ? 'var(--color-accent)' : 'var(--color-text-muted)',
                  whiteSpace: 'nowrap',
                  fontSize: 13,
                  fontWeight: activeTab === tab.id ? 'bold' : 'normal'
                }}
              >
                <span style={{ fontSize: 16 }}>{tab.icon}</span>
                <span>{tab.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '32px 20px' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div className="ui-h2">Loading store...</div>
          </div>
        ) : activeTab === 'store' ? renderStore() : renderHistory()}
      </div>

      {showCheckoutModal && selectedPackage && stripePromise && (
        <Elements stripe={stripePromise} options={elementsOptions} key={selectedPackage.id}>
          <CheckoutModal
            pkg={selectedPackage}
            onClose={handleModalClose}
            onSuccess={handlePaymentSuccess}
          />
        </Elements>
      )}
    </div>
  );
};