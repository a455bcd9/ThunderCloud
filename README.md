# ThunderCloud - Lightning in the Cloud!
This project makes it really easy (or at least as easy as it can be) to run a lightning node *cheaply* in the cloud. It contains a CDK (https://docs.aws.amazon.com/cdk/latest/guide/home.html) stack that sets up the required networking and an EC2 instance to run your node, and a setup script that installs and configures LND using neutrino as the backend. The EC2 instance used is a `t4g.micro`, an ARM-based instance with a gig of memory and two cores which runs just over $6/month, or just below $4/month if you commit to a year through a Reserved Instance (https://aws.amazon.com/ec2/pricing/reserved-instances/). So for ~$6 a month you can run a lightning node and now worry about hardware, power, networking, etc. Or if you want to run it for 2 weeks to try some experiment or something, you can and then just tear it down and stop the meter!

## Things you need to do first
- Install the AWS CLI (https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) and set it up with AWS creds.
- Install the CDK CLI (https://docs.aws.amazon.com/cdk/latest/guide/cli.html)

## Instructions
1. cd into the `thundercloud` root and do `npm install`.
2. run `cdk deploy`
3. watch the pretty bars fill up
4. It will spit out something like this:
```
Outputs:
ThundercloudStack.DownloadKeyCommand = aws secretsmanager get-secret-value --secret-id ec2-ssh-key/cdk-keypair/private --query SecretString --output text > cdk-key.pem && chmod 400 cdk-key.pem
ThundercloudStack.IPAddress = 54.159.56.96
ThundercloudStack.KeyName = cdk-keypair
ThundercloudStack.sshcommand = ssh -i cdk-key.pem -o IdentitiesOnly=yes ec2-user@54.159.56.96
```
Copy and paste that first command (`aws secretsmanager ...`) to download the SSH key for your node
5. Copy and paste the ssh command (last line) to SSH to your node. 
6. Do `ps ax` on the instance and look for lnd. if its not running, give it a minute, the setup script is stil running. 
7. `cat ~/.lnd/wallet_password` and copy it down. Then do `lncli create` to create a new lightning wallet. Supply the password you just wrote down (or copy/paste it). choose "no" when it asks if you want to encrypt the wallet. It will spit out a 24 word seed phrase **WRITE DOWN YOUR SEED WORDS**
8. That's it! you're done! you now have an LND node running in the cloud!

You can use `lncli` to open channels, create invoices, do all the fun lightning things. `bos` is also installed if you want to use it for bos-flavored channel balancing, batch channel opens, etc.

## Shutting down the node
1. go into the project root and do `cdk destroy`
There is no step 2. You can also go find the stack in CloudFormation and delete it there. either way works.

## Stuff to look at and customize
- Want to see the CFn template that CDK creates? do `cdk synth` from the project root and it'll spit out the yaml template that Cloudformation will use to create the resources.
- When your node first boots, it'll execute `lib/configure-node.sh` as root. This is where lnd gets downloaded and configured. Feel free to tweak it to your needs.
- All the infrastructure is defined in `lib/lightningnode-stack.ts`. You can add/remove/change things there to your liking. doing a `cdk deploy` will update the stack. Changing some instance properties will result in the node being deleted and recreated. Be careful changing the instance.
- If you need to change the AZs that the stack uses for VPC subnets, check out the `get availabilityZones()` in `lib/lightningnode-stack.ts`

## FAQ
- Why neutrino?
I wanted to make the instance small and cheap. If you want to run a full `bitcoind` backend (even in pruned node), you'll need an instance with more memory to get through the IBD. You're welcome to do that! edit the config file in the configure script and add bitcoind. 

- Does this run RTL or Thunderhub?
No. Maybe it will in the future. Right now it's lncli and bos only.

- How do I connect lnd's GRPC ports?
You'll need to add a security group rule for it. I'll add it to the stack soon.