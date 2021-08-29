import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import {Asset} from '@aws-cdk/aws-s3-assets';
import { KeyPair } from 'cdk-ec2-key-pair';
import * as path from 'path';


export class LightningNode extends cdk.Stack {
  get availabilityZones(): string[] {
    // Change this list if you wand to use different AZs
    return ['us-east-1b', 'us-east-1c', 'us-east-1d', 'us-east-1e', 'us-east-1f']
  }
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Set up a VPC with public and isolated subnets in 3 AZs (out of the list above)
    const vpc = new ec2.Vpc(this, "vpc", {
      cidr: "10.0.0.0/16",
      natGateways: 0,
      maxAzs: 3,
    });

    // SSH key for the node
    const key = new KeyPair(this, 'KeyPair', {
      name: 'cdk-keypair',
      description: 'Key Pair created with CDK Deployment',
    });
    key.grantReadOnPublicKey
    
    // Security groups. I made three different ones because adding/removing SGs from instances
    // is easier to do through automation than changing rules on a single SG.
    const sshSg = new ec2.SecurityGroup(this, 'sshSecurityGroup', {
      vpc,
      description: 'Allow SSH (TCP port 22) in',
    });
    sshSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH Access')
    const lightningSg = new ec2.SecurityGroup(this, "LightningSecurityGroup", {
      vpc,
      description: 'Allow lightning protocol (port 9735) traffic from the Internet',
    });
    lightningSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(9735));
    const setupScript = new Asset(this, "SetupScript", {
      path: path.join(__dirname, 'configure-node.sh')
    });
    const rpcSg = new ec2.SecurityGroup(this, "RpcSecurityGroup", {
      vpc,
      description: 'Allow access to lnd grpc interface',
    });
    rpcSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(10009));

    // grab the latest hvm arm64 AL2 AMI
    const ami = new ec2.AmazonLinuxImage({
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      cpuType: ec2.AmazonLinuxCpuType.ARM_64
    });

    const instance = new ec2.Instance(this, "lightningNode", {
      instanceType: new ec2.InstanceType("t4g.micro"),
      vpc: vpc,
      machineImage: ami,
      vpcSubnets: {subnetType: ec2.SubnetType.PUBLIC},
      keyName: key.keyPairName,
    });
    instance.addSecurityGroup(sshSg);
    instance.addSecurityGroup(lightningSg);
    // Uncomment this next line to allow access to GRPC from the world. 
    // Feel free to change the ingress rule above to lock down access to a specific IP or range
    // instance.addSecurityGroup(rpcSg);

    // Wire the bootstrap script into the instance userdata
    const localPath = instance.userData.addS3DownloadCommand({
      bucket:setupScript.bucket,
      bucketKey:setupScript.s3ObjectKey,
    });
    instance.userData.addExecuteFileCommand({
      filePath:localPath,
      arguments: '--verbose -y'
    });
    setupScript.grantRead( instance.role );

    // These outputs get printed when you are done deploying, and can be found in the "Outputs" tab
    // of the Cloudformation stack. You can also fetch them programatically. Feel free to add more
    new cdk.CfnOutput(this, 'IP Address', { value: instance.instancePublicIp });
    new cdk.CfnOutput(this, 'Key Name', { value: key.keyPairName })
    new cdk.CfnOutput(this, 'Download Key Command', { value: 'aws secretsmanager get-secret-value --secret-id ec2-ssh-key/cdk-keypair/private --query SecretString --output text > cdk-key.pem && chmod 400 cdk-key.pem' })
    new cdk.CfnOutput(this, 'ssh command', { value: 'ssh -i cdk-key.pem -o IdentitiesOnly=yes ec2-user@' + instance.instancePublicIp })
  }
}
