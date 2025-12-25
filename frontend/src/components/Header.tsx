import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="brand">
          <span className="brand-mark">PhantomPad</span>
          <span className="brand-tagline">Confidential crowdfunding for bold, global ideas.</span>
        </div>
        <div className="header-actions">
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
        </div>
      </div>
    </header>
  );
}
