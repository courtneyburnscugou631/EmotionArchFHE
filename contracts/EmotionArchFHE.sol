// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract EmotionArchFHE is SepoliaConfig {
    struct ResidentData {
        uint256 residentId;
        euint32 encryptedHeartRate;
        euint32 encryptedStressLevel;
        euint32 encryptedMoodScore;
        uint256 timestamp;
    }

    struct EnvironmentAdjustment {
        euint32 encryptedLightLevel;
        euint32 encryptedTemperature;
        euint32 encryptedSoundLevel;
        bool isApplied;
        bool isRevealed;
    }

    struct DecryptedAdjustment {
        uint32 lightLevel;
        uint32 temperature;
        uint32 soundLevel;
        bool isRevealed;
    }

    mapping(address => ResidentData[]) public residentData;
    mapping(address => EnvironmentAdjustment[]) public environmentAdjustments;
    mapping(address => DecryptedAdjustment[]) public decryptedAdjustments;
    
    uint256 public residentCount;
    uint256 public adjustmentCount;
    address public admin;
    mapping(address => bool) public authorizedDevices;
    
    event DeviceRegistered(address indexed device);
    event DataRecorded(address indexed resident, uint256 dataId);
    event AdjustmentRequested(address indexed requester, uint256 adjustmentId);
    event AdjustmentApplied(address indexed requester, uint256 adjustmentId);
    event AdjustmentRevealed(address indexed requester, uint256 adjustmentId);

    constructor() {
        admin = msg.sender;
        authorizedDevices[admin] = true;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Admin only");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedDevices[msg.sender], "Unauthorized device");
        _;
    }

    function registerDevice(address device) public onlyAdmin {
        authorizedDevices[device] = true;
        emit DeviceRegistered(device);
    }

    function recordResidentData(
        euint32 heartRate,
        euint32 stressLevel,
        euint32 moodScore
    ) public onlyAuthorized {
        residentCount++;
        residentData[msg.sender].push(ResidentData({
            residentId: residentCount,
            encryptedHeartRate: heartRate,
            encryptedStressLevel: stressLevel,
            encryptedMoodScore: moodScore,
            timestamp: block.timestamp
        }));
        emit DataRecorded(msg.sender, residentCount);
    }

    function requestEnvironmentAdjustment() public onlyAuthorized returns (uint256) {
        adjustmentCount++;
        uint256 adjustmentId = adjustmentCount;
        
        environmentAdjustments[msg.sender].push(EnvironmentAdjustment({
            encryptedLightLevel: FHE.asEuint32(0),
            encryptedTemperature: FHE.asEuint32(0),
            encryptedSoundLevel: FHE.asEuint32(0),
            isApplied: false,
            isRevealed: false
        }));
        
        emit AdjustmentRequested(msg.sender, adjustmentId);
        return adjustmentId;
    }

    function calculateAdjustment(uint256 adjustmentId) public onlyAuthorized {
        require(adjustmentId <= adjustmentCount, "Invalid adjustment ID");
        require(!environmentAdjustments[msg.sender][adjustmentId-1].isApplied, "Already adjusted");
        
        ResidentData[] storage data = residentData[msg.sender];
        euint32 totalLight = FHE.asEuint32(0);
        euint32 totalTemp = FHE.asEuint32(0);
        euint32 totalSound = FHE.asEuint32(0);
        uint32 dataCount = 0;
        
        for (uint256 i = 0; i < data.length; i++) {
            euint32 light = calculateLightLevel(
                data[i].encryptedHeartRate,
                data[i].encryptedStressLevel,
                data[i].encryptedMoodScore
            );
            
            euint32 temp = calculateTemperature(
                data[i].encryptedHeartRate,
                data[i].encryptedStressLevel
            );
            
            euint32 sound = calculateSoundLevel(
                data[i].encryptedMoodScore,
                data[i].encryptedStressLevel
            );
            
            totalLight = FHE.add(totalLight, light);
            totalTemp = FHE.add(totalTemp, temp);
            totalSound = FHE.add(totalSound, sound);
            dataCount++;
        }
        
        environmentAdjustments[msg.sender][adjustmentId-1] = EnvironmentAdjustment({
            encryptedLightLevel: FHE.div(totalLight, FHE.asEuint32(dataCount)),
            encryptedTemperature: FHE.div(totalTemp, FHE.asEuint32(dataCount)),
            encryptedSoundLevel: FHE.div(totalSound, FHE.asEuint32(dataCount)),
            isApplied: true,
            isRevealed: false
        });
        
        emit AdjustmentApplied(msg.sender, adjustmentId);
    }

    function calculateLightLevel(
        euint32 heartRate,
        euint32 stressLevel,
        euint32 moodScore
    ) private pure returns (euint32) {
        euint32 baseLight = FHE.asEuint32(50);
        euint32 hrFactor = FHE.div(heartRate, FHE.asEuint32(2));
        euint32 stressFactor = FHE.div(stressLevel, FHE.asEuint32(10));
        euint32 moodFactor = FHE.div(moodScore, FHE.asEuint32(5));
        
        return FHE.add(
            baseLight,
            FHE.sub(
                FHE.add(hrFactor, moodFactor),
                stressFactor
            )
        );
    }

    function calculateTemperature(
        euint32 heartRate,
        euint32 stressLevel
    ) private pure returns (euint32) {
        euint32 baseTemp = FHE.asEuint32(22);
        euint32 hrFactor = FHE.div(heartRate, FHE.asEuint32(10));
        euint32 stressFactor = FHE.div(stressLevel, FHE.asEuint32(5));
        
        return FHE.add(
            baseTemp,
            FHE.sub(hrFactor, stressFactor)
        );
    }

    function calculateSoundLevel(
        euint32 moodScore,
        euint32 stressLevel
    ) private pure returns (euint32) {
        euint32 baseSound = FHE.asEuint32(30);
        euint32 moodFactor = FHE.div(moodScore, FHE.asEuint32(3));
        euint32 stressFactor = FHE.div(stressLevel, FHE.asEuint32(8));
        
        return FHE.add(
            baseSound,
            FHE.sub(moodFactor, stressFactor)
        );
    }

    function requestAdjustmentDecryption(uint256 adjustmentId) public onlyAuthorized {
        require(adjustmentId <= adjustmentCount, "Invalid adjustment ID");
        require(environmentAdjustments[msg.sender][adjustmentId-1].isApplied, "Not applied");
        require(!environmentAdjustments[msg.sender][adjustmentId-1].isRevealed, "Already revealed");
        
        EnvironmentAdjustment storage adj = environmentAdjustments[msg.sender][adjustmentId-1];
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(adj.encryptedLightLevel);
        ciphertexts[1] = FHE.toBytes32(adj.encryptedTemperature);
        ciphertexts[2] = FHE.toBytes32(adj.encryptedSoundLevel);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptAdjustment.selector);
    }

    function decryptAdjustment(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public onlyAuthorized {
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32[] memory results = abi.decode(cleartexts, (uint32[]));
        address device = msg.sender;
        uint256 adjustmentId = environmentAdjustments[device].length - 1;
        
        decryptedAdjustments[device].push(DecryptedAdjustment({
            lightLevel: results[0],
            temperature: results[1],
            soundLevel: results[2],
            isRevealed: true
        }));
        
        environmentAdjustments[device][adjustmentId].isRevealed = true;
        emit AdjustmentRevealed(device, adjustmentId);
    }

    function compareResidentStates(
        uint256 dataId1,
        uint256 dataId2
    ) public view onlyAuthorized returns (ebool) {
        require(dataId1 <= residentCount && dataId2 <= residentCount, "Invalid data ID");
        
        ResidentData storage d1 = residentData[msg.sender][dataId1-1];
        ResidentData storage d2 = residentData[msg.sender][dataId2-1];
        
        ebool hrMatch = FHE.eq(d1.encryptedHeartRate, d2.encryptedHeartRate);
        ebool stressMatch = FHE.eq(d1.encryptedStressLevel, d2.encryptedStressLevel);
        ebool moodMatch = FHE.eq(d1.encryptedMoodScore, d2.encryptedMoodScore);
        
        return FHE.and(hrMatch, FHE.and(stressMatch, moodMatch));
    }

    function getResidentDataCount(address resident) public view returns (uint256) {
        return residentData[resident].length;
    }

    function getAdjustmentCount(address device) public view returns (uint256) {
        return environmentAdjustments[device].length;
    }

    function getDecryptedAdjustment(address device, uint256 adjustmentId) public view returns (
        uint32 lightLevel,
        uint32 temperature,
        uint32 soundLevel,
        bool isRevealed
    ) {
        require(adjustmentId <= decryptedAdjustments[device].length, "Invalid adjustment ID");
        DecryptedAdjustment storage adj = decryptedAdjustments[device][adjustmentId-1];
        return (adj.lightLevel, adj.temperature, adj.soundLevel, adj.isRevealed);
    }
}