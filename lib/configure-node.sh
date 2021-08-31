#!/bin/bash

# Download and unpack the latest lnd. 
wget https://github.com/lightningnetwork/lnd/releases/download/v0.13.1-beta/lnd-linux-arm64-v0.13.1-beta.tar.gz
# TODO: verify signatures on the download
tar xf lnd-linux-arm64-v0.13.1-beta.tar.gz
mkdir /home/ec2-user/bin
cp lnd-linux-arm64-v0.13.1-beta/* /home/ec2-user/bin/
rm -rf lnd-linux-arm64-v0.13.1-beta*

# Write lnd config. Feel free to customize this to your liking. You'll want to change the node alias
mkdir /home/ec2-user/.lnd
PUBLIC_IPV4=$(curl http://169.254.169.254/latest/meta-data/public-ipv4/)
cat << EOF > /home/ec2-user/.lnd/lnd.conf
[Application Options]
# Allow push payments
accept-keysend=1

# Public network name
alias=CloudPleb

# Allow gift routes
allow-circular-route=1

# Public hex color
color=#000000

# Reduce the cooperative close chain fee
coop-close-target-confs=1000

# Log levels
debuglevel=CNCT=debug,CRTR=debug,HSWC=debug,NTFN=debug,RPCS=debug

# Public P2P IP (remove this if using Tor)
externalip=$PUBLIC_IPV4

# Mark unpayable, unpaid invoices as deleted
gc-canceled-invoices-on-startup=1
gc-canceled-invoices-on-the-fly=1

# Avoid historical graph data sync
ignore-historical-gossip-filters=1

# Set the maximum amount of commit fees in a channel
max-channel-fee-allocation=1.0

# Set the max timeout blocks of a payment
max-cltv-expiry=5000

# Allow commitment fee to rise on anchor channels
max-commit-fee-rate-anchors=100

# Pending channel limit
maxpendingchannels=10

# Min inbound channel limit
#minchansize=5000000

listen=0.0.0.0:9735

# gRPC socket binding
rpclisten=0.0.0.0:10009

# REST socket binding
restlisten=0.0.0.0:8080

# Avoid slow startup time
sync-freelist=1

# Avoid high startup overhead
stagger-initial-reconnect=1

# Delete and recreate RPC TLS certificate when details change or cert expires
tlsautorefresh=1

# Do not include IPs in the RPC TLS certificate
tlsdisableautofill=1

[Bitcoin]
# Turn on Bitcoin mode
bitcoin.active=1

# Set the channel confs to wait for channels
bitcoin.defaultchanconfs=2

# Forward fee rate in parts per million
bitcoin.feerate=1000

# Set bitcoin.testnet=1 or bitcoin.mainnet=1 as appropriate
bitcoin.mainnet=1

# Set the lower bound for HTLCs
bitcoin.minhtlc=1

# Set backing node, bitcoin.node=neutrino or bitcoin.node=bitcoind
bitcoin.node=neutrino

[neutrino]
# Mainnet addpeers
neutrino.addpeer=btcd-mainnet.lightning.computer
neutrino.addpeer=mainnet1-btcd.zaphq.io
neutrino.addpeer=mainnet2-btcd.zaphq.io
neutrino.addpeer=mainnet3-btcd.zaphq.io
neutrino.addpeer=mainnet4-btcd.zaphq.io

# Testnet addpeers
neutrino.addpeer=btcd-testnet.ion.radar.tech
neutrino.addpeer=btcd-testnet.lightning.computer
neutrino.addpeer=lnd.bitrefill.com:18333
neutrino.addpeer=faucet.lightning.community
neutrino.addpeer=testnet1-btcd.zaphq.io
neutrino.addpeer=testnet2-btcd.zaphq.io
neutrino.addpeer=testnet3-btcd.zaphq.io
neutrino.addpeer=testnet4-btcd.zaphq.io

# Set fee data URL, change to btc-fee-estimates.json if mainnet
neutrino.feeurl=https://nodes.lightning.computer/fees/v1/btctestnet-fee-estimates.json


[protocol]
# Enable large channels support
protocol.wumbo-channels=1

[routerrpc]
# Set default chance of a hop success
routerrpc.apriorihopprob=0.5

# Start to ignore nodes if they return many failures (set to 1 to turn off)
routerrpc.aprioriweight=0.75

# Set minimum desired savings of trying a cheaper path
routerrpc.attemptcost=10
routerrpc.attemptcostppm=10

# Set the number of historical routing records
routerrpc.maxmchistory=10000

# Set the min confidence in a path worth trying
routerrpc.minrtprob=0.005

# Set the time to forget past routing failures
routerrpc.penaltyhalflife=6h0m0s

[routing]
# Set validation of channels off: only if using Neutrino
routing.assumechanvalid=1

EOF

# Generate a random password for the lnd wallet. 
# Note: YOU should still be the one to run `lnd create` so that you can write down the seed backup
openssl rand -hex 21 > /home/ec2-user/.lnd/wallet_password

# Write a systemd script so it starts up at boot or restarts if it dies
cat << EOF > /etc/systemd/system/lnd.service
[Service]
Environment=HOME=/home/ec2-user
ExecStart=/home/ec2-user/bin/lnd
ExecStop=/home/ec2-user/bin/lncli stop
Restart=always
RestartSec=30
StandardOutput=null
StandardError=null
SyslogIdentifier=lnd
User=ec2-user
Group=ec2-user

[Install]
WantedBy=multi-user.target

EOF

# Setup bos. currently kind of broken. npm gets installed though
curl -sL https://rpm.nodesource.com/setup_14.x | sudo bash -
yum install -y nodejs
mkdir /home/ec2-user/.npm-global
npm config set prefix '/home/ec2-user/.npm-global'
echo 'PATH=/home/ec2-user/.npm-global/bin:$PATH' >> /home/ec2-user/.bashrc
npm install -g balanceofsatoshis

# make sure the user owns everything we just did
chown -R ec2-user: /home/ec2-user/.lnd
chown -R ec2-user: /home/ec2-user/.npm-global
chown -R ec2-user: /home/ec2-user/bin

# ensure the wallet is unlocked by unlocking it every 5 minutes
echo '*/5 * * * * ec2-user /home/ec2-user/.npm-global/bin/bos unlock /home/ec2-user/.lnd/wallet_password' >> /etc/crontab

# Start lnd!
systemctl enable lnd.service
systemctl start lnd.service