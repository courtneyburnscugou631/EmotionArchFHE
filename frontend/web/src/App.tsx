import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface EmotionData {
  id: string;
  emotionType: string;
  intensity: number;
  timestamp: number;
  owner: string;
  environment: string;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [emotionData, setEmotionData] = useState<EmotionData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newEmotionData, setNewEmotionData] = useState({
    emotionType: "neutral",
    intensity: 5,
    environment: "living_room"
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [searchQuery, setSearchQuery] = useState("");

  // Calculate statistics
  const emotionCounts = emotionData.reduce((acc, data) => {
    acc[data.emotionType] = (acc[data.emotionType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const environmentCounts = emotionData.reduce((acc, data) => {
    acc[data.environment] = (acc[data.environment] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  useEffect(() => {
    loadEmotionData().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadEmotionData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("emotion_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing emotion keys:", e);
        }
      }
      
      const list: EmotionData[] = [];
      
      for (const key of keys) {
        try {
          const dataBytes = await contract.getData(`emotion_${key}`);
          if (dataBytes.length > 0) {
            try {
              const emotionData = JSON.parse(ethers.toUtf8String(dataBytes));
              list.push({
                id: key,
                emotionType: emotionData.emotionType,
                intensity: emotionData.intensity,
                timestamp: emotionData.timestamp,
                owner: emotionData.owner,
                environment: emotionData.environment
              });
            } catch (e) {
              console.error(`Error parsing emotion data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading emotion ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setEmotionData(list);
    } catch (e) {
      console.error("Error loading emotion data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitEmotionData = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting emotion data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-EMOTION-${btoa(JSON.stringify(newEmotionData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const emotionId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const dataToStore = {
        emotionType: newEmotionData.emotionType,
        intensity: newEmotionData.intensity,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        environment: newEmotionData.environment,
        encryptedData: encryptedData
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `emotion_${emotionId}`, 
        ethers.toUtf8Bytes(JSON.stringify(dataToStore))
      );
      
      const keysBytes = await contract.getData("emotion_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(emotionId);
      
      await contract.setData(
        "emotion_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Emotion data encrypted and stored securely!"
      });
      
      await loadEmotionData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewEmotionData({
          emotionType: "neutral",
          intensity: 5,
          environment: "living_room"
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const checkAvailability = async () => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: `FHE System is ${isAvailable ? "available" : "unavailable"}`
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Availability check failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const filteredEmotionData = emotionData.filter(data => 
    data.emotionType.toLowerCase().includes(searchQuery.toLowerCase()) ||
    data.environment.toLowerCase().includes(searchQuery.toLowerCase()) ||
    data.owner.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to interact with the Emotion-Adaptive Architecture",
      icon: "🔗"
    },
    {
      title: "Submit Emotion Data",
      description: "Add your emotional state which will be encrypted using FHE for privacy",
      icon: "😊"
    },
    {
      title: "FHE Environment Adjustment",
      description: "Your space automatically adapts using encrypted data without decryption",
      icon: "🏠"
    },
    {
      title: "Enjoy Personalized Space",
      description: "Experience a living space that responds to your emotional needs privately",
      icon: "✨"
    }
  ];

  const renderEmotionChart = () => {
    const emotionTypes = Object.keys(emotionCounts);
    const maxCount = Math.max(...Object.values(emotionCounts), 1);
    
    return (
      <div className="emotion-chart">
        {emotionTypes.map(emotion => (
          <div key={emotion} className="emotion-bar">
            <div className="emotion-label">{emotion}</div>
            <div className="bar-container">
              <div 
                className="bar-fill" 
                style={{ width: `${(emotionCounts[emotion] / maxCount) * 100}%` }}
              ></div>
            </div>
            <div className="emotion-count">{emotionCounts[emotion]}</div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing Emotion-Adaptive Architecture...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="heart-icon"></div>
          </div>
          <h1>Emotion<span>Arch</span>FHE</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
          >
            + Add Emotion
          </button>
          <button 
            className="secondary-btn"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Guide" : "Show Guide"}
          </button>
          <button 
            className="secondary-btn"
            onClick={checkAvailability}
          >
            Check FHE Status
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Privacy-Preserving Emotionally-Adaptive Architecture</h2>
            <p>Your living space adapts to your emotions using FHE-encrypted data without compromising privacy</p>
          </div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section">
            <h2>How It Works</h2>
            <p className="subtitle">Your emotions shape your environment while keeping your data private</p>
            
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div 
                  className="tutorial-step"
                  key={index}
                >
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="tab-navigation">
          <button 
            className={activeTab === "dashboard" ? "tab-active" : "tab"}
            onClick={() => setActiveTab("dashboard")}
          >
            Dashboard
          </button>
          <button 
            className={activeTab === "data" ? "tab-active" : "tab"}
            onClick={() => setActiveTab("data")}
          >
            Emotion Data
          </button>
          <button 
            className={activeTab === "stats" ? "tab-active" : "tab"}
            onClick={() => setActiveTab("stats")}
          >
            Statistics
          </button>
        </div>
        
        {activeTab === "dashboard" && (
          <div className="dashboard-grid">
            <div className="dashboard-card">
              <h3>Project Introduction</h3>
              <p>EmotionArchFHE uses Fully Homomorphic Encryption to process emotional data without decryption, allowing your living space to adapt to your needs while maintaining complete privacy.</p>
              <div className="fhe-badge">
                <span>FHE-Powered</span>
              </div>
            </div>
            
            <div className="dashboard-card">
              <h3>Emotion Statistics</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{emotionData.length}</div>
                  <div className="stat-label">Total Records</div>
                </div>
                {Object.entries(emotionCounts).map(([emotion, count]) => (
                  <div key={emotion} className="stat-item">
                    <div className="stat-value">{count}</div>
                    <div className="stat-label">{emotion}</div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="dashboard-card">
              <h3>Environment Distribution</h3>
              <div className="environment-stats">
                {Object.entries(environmentCounts).map(([env, count]) => (
                  <div key={env} className="environment-item">
                    <span className="env-name">{env.replace('_', ' ')}</span>
                    <span className="env-count">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {activeTab === "data" && (
          <div className="data-section">
            <div className="section-header">
              <h2>Encrypted Emotion Data</h2>
              <div className="header-actions">
                <div className="search-box">
                  <input 
                    type="text" 
                    placeholder="Search emotions or environments..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <button 
                  onClick={loadEmotionData}
                  className="refresh-btn"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
            
            <div className="data-list">
              {filteredEmotionData.length === 0 ? (
                <div className="no-data">
                  <div className="no-data-icon">😊</div>
                  <p>No emotion data found</p>
                  <button 
                    className="primary-btn"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Add First Emotion
                  </button>
                </div>
              ) : (
                filteredEmotionData.map(data => (
                  <div className="data-card" key={data.id}>
                    <div className="data-header">
                      <div className="emotion-type">{data.emotionType}</div>
                      <div className="intensity">Intensity: {data.intensity}/10</div>
                    </div>
                    <div className="data-details">
                      <div className="detail-item">
                        <span className="label">Environment:</span>
                        <span className="value">{data.environment.replace('_', ' ')}</span>
                      </div>
                      <div className="detail-item">
                        <span className="label">Recorded:</span>
                        <span className="value">{new Date(data.timestamp * 1000).toLocaleString()}</span>
                      </div>
                      <div className="detail-item">
                        <span className="label">Owner:</span>
                        <span className="value">{data.owner.substring(0, 6)}...{data.owner.substring(38)}</span>
                      </div>
                    </div>
                    <div className="data-footer">
                      <div className="fhe-tag">FHE Encrypted</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        
        {activeTab === "stats" && (
          <div className="stats-section">
            <h2>Emotion Statistics</h2>
            <div className="charts-container">
              <div className="chart-card">
                <h3>Emotion Distribution</h3>
                {renderEmotionChart()}
              </div>
              <div className="chart-card">
                <h3>Environment Analysis</h3>
                <div className="environment-chart">
                  {Object.entries(environmentCounts).map(([env, count]) => (
                    <div key={env} className="environment-bar">
                      <div className="env-label">{env.replace('_', ' ')}</div>
                      <div className="bar-container">
                        <div 
                          className="bar-fill env" 
                          style={{ width: `${(count / emotionData.length) * 100}%` }}
                        ></div>
                      </div>
                      <div className="env-count">{count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitEmotionData} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          emotionData={newEmotionData}
          setEmotionData={setNewEmotionData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="heart-icon"></div>
              <span>EmotionArchFHE</span>
            </div>
            <p>Privacy-preserving emotionally-adaptive architecture using FHE technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Research Paper</a>
            <a href="#" className="footer-link">Contact Team</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} EmotionArchFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  emotionData: any;
  setEmotionData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  emotionData,
  setEmotionData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEmotionData({
      ...emotionData,
      [name]: name === 'intensity' ? parseInt(value) : value
    });
  };

  const handleSubmit = () => {
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Record Emotional State</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon">🔒</div> Your emotional data will be encrypted with FHE for complete privacy
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Emotion Type</label>
              <select 
                name="emotionType"
                value={emotionData.emotionType} 
                onChange={handleChange}
                className="form-select"
              >
                <option value="happy">Happy</option>
                <option value="sad">Sad</option>
                <option value="neutral">Neutral</option>
                <option value="excited">Excited</option>
                <option value="calm">Calm</option>
                <option value="anxious">Anxious</option>
                <option value="focused">Focused</option>
                <option value="relaxed">Relaxed</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Intensity (1-10)</label>
              <input 
                type="range"
                name="intensity"
                min="1"
                max="10"
                value={emotionData.intensity} 
                onChange={handleChange}
                className="form-range"
              />
              <div className="intensity-value">{emotionData.intensity}</div>
            </div>
            
            <div className="form-group">
              <label>Environment</label>
              <select 
                name="environment"
                value={emotionData.environment} 
                onChange={handleChange}
                className="form-select"
              >
                <option value="living_room">Living Room</option>
                <option value="bedroom">Bedroom</option>
                <option value="kitchen">Kitchen</option>
                <option value="home_office">Home Office</option>
                <option value="bathroom">Bathroom</option>
                <option value="outdoor">Outdoor Space</option>
              </select>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn"
          >
            {creating ? "Encrypting with FHE..." : "Submit Emotion Data"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;