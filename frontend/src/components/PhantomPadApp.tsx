import { useMemo, useState } from 'react';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { AbiCoder, Contract } from 'ethers';
import { isAddress } from 'viem';

import { Header } from './Header';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import {
  CONFIDENTIAL_USDC_ABI,
  CONFIDENTIAL_USDC_ADDRESS,
  PHANTOM_PAD_ABI,
  PHANTOM_PAD_ADDRESS,
} from '../config/contracts';
import '../styles/PhantomPadApp.css';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const UINT64_MAX = 2n ** 64n - 1n;
const ZERO_HANDLE_REGEX = /^0x0+$/;

type CampaignView = {
  id: number;
  name: string;
  target: string;
  deadline: bigint;
  ended: boolean;
  totalRaised: string;
  creator: string;
};

type StatusMessage = {
  type: 'success' | 'error' | 'info';
  text: string;
};

export function PhantomPadApp() {
  const { address } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const phantomPadAddress = PHANTOM_PAD_ADDRESS as `0x${string}`;
  const cusdcAddress = CONFIDENTIAL_USDC_ADDRESS as `0x${string}`;
  const isConfigured =
    isAddress(phantomPadAddress) &&
    phantomPadAddress !== ZERO_ADDRESS &&
    isAddress(cusdcAddress) &&
    cusdcAddress !== ZERO_ADDRESS;

  const [createName, setCreateName] = useState('');
  const [createTarget, setCreateTarget] = useState('');
  const [createDeadline, setCreateDeadline] = useState('');
  const [mintAmount, setMintAmount] = useState('');
  const [contributionInputs, setContributionInputs] = useState<Record<number, string>>({});
  const [decryptedTargets, setDecryptedTargets] = useState<Record<number, string>>({});
  const [decryptedTotals, setDecryptedTotals] = useState<Record<number, string>>({});
  const [decryptedContributions, setDecryptedContributions] = useState<Record<number, string>>({});
  const [decryptedBalance, setDecryptedBalance] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const { data: campaignCountRaw } = useReadContract({
    address: phantomPadAddress,
    abi: PHANTOM_PAD_ABI,
    functionName: 'campaignCount',
    query: {
      enabled: isConfigured,
    },
  });

  const campaignCount = Number(campaignCountRaw ?? 0n);
  const campaignIds = useMemo(() => {
    if (!campaignCount) return [];
    return Array.from({ length: campaignCount }, (_, index) => index + 1);
  }, [campaignCount]);

  const { data: campaignResults } = useReadContracts({
    allowFailure: true,
    contracts: campaignIds.map((id) => ({
      address: phantomPadAddress,
      abi: PHANTOM_PAD_ABI,
      functionName: 'getCampaign',
      args: [BigInt(id)],
    })),
    query: {
      enabled: isConfigured && campaignIds.length > 0,
    },
  });

  const campaigns: CampaignView[] = useMemo(() => {
    if (!campaignResults) return [];
    return campaignResults
      .map((result, index) => {
        if (result.status !== 'success' || !result.result) {
          return null;
        }
        const resultTuple = result.result as unknown;
        if (!Array.isArray(resultTuple) || resultTuple.length < 6) {
          return null;
        }
        const [name, target, deadline, ended, totalRaised, creator] = resultTuple as [
          string,
          string,
          bigint,
          boolean,
          string,
          string,
        ];
        return {
          id: campaignIds[index],
          name,
          target,
          deadline,
          ended,
          totalRaised,
          creator,
        };
      })
      .filter((item): item is CampaignView => item !== null);
  }, [campaignResults, campaignIds]);

  const contributionContracts = useMemo(() => {
    if (!address) return [];
    return campaignIds.map((id) => ({
      address: phantomPadAddress,
      abi: PHANTOM_PAD_ABI,
      functionName: 'contributionOf',
      args: [BigInt(id), address],
    }));
  }, [address, campaignIds, phantomPadAddress]);

  const { data: contributionResults } = useReadContracts({
    allowFailure: true,
    contracts: contributionContracts,
    query: {
      enabled: isConfigured && contributionContracts.length > 0,
    },
  });

  const contributionHandles = useMemo(() => {
    const map: Record<number, string> = {};
    if (!contributionResults) return map;
    contributionResults.forEach((result, index) => {
      if (result.status === 'success' && result.result) {
        map[campaignIds[index]] = result.result as string;
      }
    });
    return map;
  }, [contributionResults, campaignIds]);

  const { data: balanceHandle } = useReadContract({
    address: cusdcAddress,
    abi: CONFIDENTIAL_USDC_ABI,
    functionName: 'confidentialBalanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: isConfigured && !!address,
    },
  });

  const activeCount = useMemo(() => {
    const now = Date.now() / 1000;
    return campaigns.filter((campaign) => !campaign.ended && Number(campaign.deadline) > now).length;
  }, [campaigns]);

  const setNotice = (type: StatusMessage['type'], text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 6000);
  };

  const formatAddress = (value?: string) => {
    if (!value) return 'N/A';
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
  };

  const formatDate = (value: bigint) => {
    return new Date(Number(value) * 1000).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const timeRemaining = (deadline: bigint) => {
    const ms = Number(deadline) * 1000 - Date.now();
    if (ms <= 0) return 'Deadline passed';
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    const remainderHours = hours % 24;
    if (days > 0) return `${days}d ${remainderHours}h left`;
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    return `${remainderHours}h ${minutes}m left`;
  };

  const parseUint64 = (raw: string) => {
    const cleaned = raw.trim();
    if (!/^\d+$/.test(cleaned)) {
      throw new Error('Enter a whole number amount.');
    }
    const value = BigInt(cleaned);
    if (value <= 0n) {
      throw new Error('Amount must be greater than zero.');
    }
    if (value > UINT64_MAX) {
      throw new Error('Amount exceeds uint64 range.');
    }
    return value;
  };

  const isZeroHandle = (handle?: string) => {
    if (!handle) return true;
    return ZERO_HANDLE_REGEX.test(handle);
  };

  const userDecrypt = async (contractAddress: string, handles: string[]) => {
    if (!instance || !address) {
      throw new Error('Connect a wallet and wait for the Zama relayer.');
    }
    const signer = await signerPromise;
    if (!signer) {
      throw new Error('Wallet signer unavailable.');
    }
    const keypair = instance.generateKeypair();
    const handleContractPairs = handles.map((handle) => ({ handle, contractAddress }));
    const startTimeStamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = '10';
    const contractAddresses = [contractAddress];
    const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
    const signature = await signer.signTypedData(
      eip712.domain,
      {
        UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
      },
      eip712.message,
    );
    const result = await instance.userDecrypt(
      handleContractPairs,
      keypair.privateKey,
      keypair.publicKey,
      signature.replace('0x', ''),
      contractAddresses,
      address,
      startTimeStamp,
      durationDays,
    );
    return result;
  };

  const handleCreateCampaign = async () => {
    if (!isConfigured) {
      setNotice('error', 'Contract addresses are not configured yet.');
      return;
    }
    if (!createName.trim()) {
      setNotice('error', 'Campaign name is required.');
      return;
    }
    if (!createDeadline) {
      setNotice('error', 'Select a deadline.');
      return;
    }
    try {
      const target = parseUint64(createTarget);
      const deadlineMs = Date.parse(createDeadline);
      if (Number.isNaN(deadlineMs)) {
        throw new Error('Invalid deadline.');
      }
      const deadlineSeconds = Math.floor(deadlineMs / 1000);
      if (deadlineSeconds <= Math.floor(Date.now() / 1000)) {
        throw new Error('Deadline must be in the future.');
      }
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Connect a wallet to create a campaign.');
      }
      setPendingAction('create');
      const phantomPad = new Contract(phantomPadAddress, PHANTOM_PAD_ABI, signer);
      const tx = await phantomPad.createCampaign(createName.trim(), target, deadlineSeconds);
      await tx.wait();
      setCreateName('');
      setCreateTarget('');
      setCreateDeadline('');
      setNotice('success', 'Campaign created successfully.');
    } catch (error) {
      setNotice('error', error instanceof Error ? error.message : 'Failed to create campaign.');
    } finally {
      setPendingAction(null);
    }
  };

  const handleMint = async () => {
    if (!isConfigured) {
      setNotice('error', 'Contract addresses are not configured yet.');
      return;
    }
    try {
      const amount = parseUint64(mintAmount);
      const signer = await signerPromise;
      if (!signer || !address) {
        throw new Error('Connect a wallet to mint.');
      }
      setPendingAction('mint');
      const cusdc = new Contract(cusdcAddress, CONFIDENTIAL_USDC_ABI, signer);
      const tx = await cusdc.mint(address, amount);
      await tx.wait();
      setMintAmount('');
      setNotice('success', 'Minted test cUSDC.');
    } catch (error) {
      setNotice('error', error instanceof Error ? error.message : 'Failed to mint cUSDC.');
    } finally {
      setPendingAction(null);
    }
  };

  const handleContribute = async (campaignId: number) => {
    if (!isConfigured) {
      setNotice('error', 'Contract addresses are not configured yet.');
      return;
    }
    if (!instance) {
      setNotice('error', 'Zama relayer not ready yet.');
      return;
    }
    try {
      const amount = parseUint64(contributionInputs[campaignId] || '');
      if (!address) {
        throw new Error('Connect a wallet to contribute.');
      }
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable.');
      }
      setPendingAction(`contribute-${campaignId}`);
      const input = instance.createEncryptedInput(cusdcAddress, address);
      input.add64(amount);
      const encrypted = await input.encrypt();
      const cusdc = new Contract(cusdcAddress, CONFIDENTIAL_USDC_ABI, signer);
      const data = AbiCoder.defaultAbiCoder().encode(['uint256'], [BigInt(campaignId)]);
      const tx = await cusdc['confidentialTransferAndCall(address,bytes32,bytes,bytes)'](
        phantomPadAddress,
        encrypted.handles[0],
        encrypted.inputProof,
        data,
      );
      await tx.wait();
      setContributionInputs((prev) => ({ ...prev, [campaignId]: '' }));
      setNotice('success', `Contribution sent to campaign ${campaignId}.`);
    } catch (error) {
      setNotice('error', error instanceof Error ? error.message : 'Contribution failed.');
    } finally {
      setPendingAction(null);
    }
  };

  const handleEndCampaign = async (campaignId: number) => {
    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Connect a wallet to end a campaign.');
      }
      setPendingAction(`end-${campaignId}`);
      const phantomPad = new Contract(phantomPadAddress, PHANTOM_PAD_ABI, signer);
      const tx = await phantomPad.endCampaign(campaignId);
      await tx.wait();
      setNotice('success', `Campaign ${campaignId} ended.`);
    } catch (error) {
      setNotice('error', error instanceof Error ? error.message : 'Failed to end campaign.');
    } finally {
      setPendingAction(null);
    }
  };

  const handleDecryptBalance = async () => {
    try {
      if (!balanceHandle || isZeroHandle(balanceHandle as string)) {
        throw new Error('No balance to decrypt yet.');
      }
      setPendingAction('decrypt-balance');
      const result = await userDecrypt(cusdcAddress, [balanceHandle as string]);
      const decryptedValue = result[balanceHandle as string];
      setDecryptedBalance(BigInt(decryptedValue).toString());
    } catch (error) {
      setNotice('error', error instanceof Error ? error.message : 'Failed to decrypt balance.');
    } finally {
      setPendingAction(null);
    }
  };

  const handleDecryptTarget = async (campaign: CampaignView) => {
    try {
      setPendingAction(`target-${campaign.id}`);
      const result = await userDecrypt(phantomPadAddress, [campaign.target]);
      const decryptedValue = result[campaign.target];
      setDecryptedTargets((prev) => ({
        ...prev,
        [campaign.id]: BigInt(decryptedValue).toString(),
      }));
    } catch (error) {
      setNotice('error', error instanceof Error ? error.message : 'Failed to decrypt target.');
    } finally {
      setPendingAction(null);
    }
  };

  const handleDecryptTotal = async (campaign: CampaignView) => {
    try {
      setPendingAction(`total-${campaign.id}`);
      const result = await userDecrypt(phantomPadAddress, [campaign.totalRaised]);
      const decryptedValue = result[campaign.totalRaised];
      setDecryptedTotals((prev) => ({
        ...prev,
        [campaign.id]: BigInt(decryptedValue).toString(),
      }));
    } catch (error) {
      setNotice('error', error instanceof Error ? error.message : 'Failed to decrypt total.');
    } finally {
      setPendingAction(null);
    }
  };

  const handleDecryptContribution = async (campaignId: number) => {
    const handle = contributionHandles[campaignId];
    if (isZeroHandle(handle)) {
      setNotice('info', 'No contribution to decrypt yet.');
      return;
    }
    try {
      setPendingAction(`contribution-${campaignId}`);
      const result = await userDecrypt(phantomPadAddress, [handle]);
      const decryptedValue = result[handle];
      setDecryptedContributions((prev) => ({
        ...prev,
        [campaignId]: BigInt(decryptedValue).toString(),
      }));
    } catch (error) {
      setNotice('error', error instanceof Error ? error.message : 'Failed to decrypt contribution.');
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="phantom-app">
      <Header />

      <section className="hero">
        <div className="hero-content">
          <p className="hero-label">Encrypted crowdfunding on Sepolia</p>
          <h2>Fund the next phantom idea with private cUSDC.</h2>
          <p className="hero-subtitle">
            Build campaigns in the open, contribute in secret, and let Zama FHE keep every pledge confidential.
          </p>
        </div>
        <div className="hero-stats">
          <div className="stat-card">
            <span className="stat-label">Campaigns</span>
            <span className="stat-value">{campaignCount}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Active</span>
            <span className="stat-value">{activeCount}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Relayer</span>
            <span className="stat-value">{zamaLoading ? 'Loading' : zamaError ? 'Offline' : 'Ready'}</span>
          </div>
        </div>
      </section>

      {statusMessage && (
        <div className={`status-banner ${statusMessage.type}`}>{statusMessage.text}</div>
      )}

      {!isConfigured && (
        <div className="status-banner warning">
          Configure `frontend/src/config/contracts.ts` with the deployed Sepolia addresses before using the app.
        </div>
      )}

      <section className="section-grid">
        <div className="panel">
          <h3>Your cUSDC</h3>
          <p className="panel-subtitle">Encrypted balance and quick mint for testing.</p>
          <div className="panel-row">
            <div>
              <span className="panel-label">Balance</span>
              <span className="panel-value">
                {decryptedBalance ? `${decryptedBalance} cUSDC` : 'Encrypted'}
              </span>
            </div>
            <button
              className="ghost-button"
              onClick={handleDecryptBalance}
              disabled={!balanceHandle || pendingAction === 'decrypt-balance'}
            >
              {pendingAction === 'decrypt-balance' ? 'Decrypting...' : 'Decrypt balance'}
            </button>
          </div>
          <div className="panel-row">
            <input
              className="text-input"
              type="number"
              min="1"
              placeholder="Mint amount"
              value={mintAmount}
              onChange={(event) => setMintAmount(event.target.value)}
            />
            <button
              className="primary-button"
              onClick={handleMint}
              disabled={!mintAmount || pendingAction === 'mint'}
            >
              {pendingAction === 'mint' ? 'Minting...' : 'Mint test cUSDC'}
            </button>
          </div>
        </div>

        <div className="panel">
          <h3>Create a campaign</h3>
          <p className="panel-subtitle">Define a name, target, and end date to start collecting encrypted pledges.</p>
          <div className="panel-stack">
            <label className="input-label">
              Campaign name
              <input
                className="text-input"
                type="text"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="Phantom Launch"
              />
            </label>
            <label className="input-label">
              Target amount (cUSDC)
              <input
                className="text-input"
                type="number"
                min="1"
                value={createTarget}
                onChange={(event) => setCreateTarget(event.target.value)}
                placeholder="5000"
              />
            </label>
            <label className="input-label">
              Deadline
              <input
                className="text-input"
                type="datetime-local"
                value={createDeadline}
                onChange={(event) => setCreateDeadline(event.target.value)}
              />
            </label>
          </div>
          <button
            className="primary-button"
            onClick={handleCreateCampaign}
            disabled={pendingAction === 'create' || !createName || !createTarget || !createDeadline}
          >
            {pendingAction === 'create' ? 'Creating...' : 'Launch campaign'}
          </button>
        </div>
      </section>

      <section className="campaigns-section">
        <div className="section-header">
          <div>
            <h3>Campaigns</h3>
            <p className="section-subtitle">Decrypt totals with your wallet permissions and contribute in secret.</p>
          </div>
        </div>

        {campaigns.length === 0 ? (
          <div className="empty-state">
            <h4>No campaigns yet</h4>
            <p>Create the first PhantomPad campaign and set the pace.</p>
          </div>
        ) : (
          <div className="campaign-grid">
            {campaigns.map((campaign) => {
              const isActive = !campaign.ended && Number(campaign.deadline) > Date.now() / 1000;
              const isCreator = address?.toLowerCase() === campaign.creator.toLowerCase();
              const contributionValue = decryptedContributions[campaign.id];
              return (
                <article className="campaign-card" key={campaign.id}>
                  <div className="campaign-header">
                    <div>
                      <span className="campaign-id">Campaign {campaign.id}</span>
                      <h4>{campaign.name || 'Untitled campaign'}</h4>
                    </div>
                    <span className={`pill ${isActive ? 'pill-active' : 'pill-closed'}`}>
                      {isActive ? 'Open' : 'Closed'}
                    </span>
                  </div>

                  <div className="campaign-meta">
                    <div>
                      <span className="meta-label">Creator</span>
                      <span className="meta-value">{formatAddress(campaign.creator)}</span>
                    </div>
                    <div>
                      <span className="meta-label">Deadline</span>
                      <span className="meta-value">{formatDate(campaign.deadline)}</span>
                      <span className="meta-sub">{timeRemaining(campaign.deadline)}</span>
                    </div>
                  </div>

                  <div className="campaign-metrics">
                    <div className="metric">
                      <span className="meta-label">Target</span>
                      <span className="metric-value">
                        {decryptedTargets[campaign.id] ? `${decryptedTargets[campaign.id]} cUSDC` : 'Encrypted'}
                      </span>
                      <button
                        className="ghost-button small"
                        onClick={() => handleDecryptTarget(campaign)}
                        disabled={pendingAction === `target-${campaign.id}`}
                      >
                        {pendingAction === `target-${campaign.id}` ? 'Decrypting...' : 'Decrypt'}
                      </button>
                    </div>
                    <div className="metric">
                      <span className="meta-label">Total raised</span>
                      <span className="metric-value">
                        {decryptedTotals[campaign.id] ? `${decryptedTotals[campaign.id]} cUSDC` : 'Encrypted'}
                      </span>
                      <button
                        className="ghost-button small"
                        onClick={() => handleDecryptTotal(campaign)}
                        disabled={pendingAction === `total-${campaign.id}`}
                      >
                        {pendingAction === `total-${campaign.id}` ? 'Decrypting...' : 'Decrypt'}
                      </button>
                    </div>
                  </div>

                  <div className="campaign-actions">
                    <input
                      className="text-input"
                      type="number"
                      min="1"
                      placeholder="Contribution amount"
                      value={contributionInputs[campaign.id] || ''}
                      onChange={(event) =>
                        setContributionInputs((prev) => ({
                          ...prev,
                          [campaign.id]: event.target.value,
                        }))
                      }
                      disabled={!isActive}
                    />
                    <button
                      className="primary-button"
                      onClick={() => handleContribute(campaign.id)}
                      disabled={!isActive || pendingAction === `contribute-${campaign.id}`}
                    >
                      {pendingAction === `contribute-${campaign.id}` ? 'Sending...' : 'Contribute'}
                    </button>
                  </div>

                  <div className="campaign-footer">
                    <div>
                      <span className="meta-label">My contribution</span>
                      <span className="meta-value">{contributionValue ? `${contributionValue} cUSDC` : 'Encrypted'}</span>
                    </div>
                    <div className="footer-actions">
                      <button
                        className="ghost-button small"
                        onClick={() => handleDecryptContribution(campaign.id)}
                        disabled={pendingAction === `contribution-${campaign.id}`}
                      >
                        {pendingAction === `contribution-${campaign.id}` ? 'Decrypting...' : 'Decrypt'}
                      </button>
                      {isCreator && !campaign.ended && (
                        <button
                          className="danger-button small"
                          onClick={() => handleEndCampaign(campaign.id)}
                          disabled={pendingAction === `end-${campaign.id}`}
                        >
                          {pendingAction === `end-${campaign.id}` ? 'Ending...' : 'End campaign'}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
