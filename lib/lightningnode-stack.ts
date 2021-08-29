import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import {Asset} from '@aws-cdk/aws-s3-assets';
import { KeyPair } from 'cdk-ec2-key-pair';
import * as path from 'path';


export class LightningNode extends cdk.Stack {
  get availabilityZones(): string[] {
    return ['us-east-1b', 'us-east-1c', 'us-east-1d', 'us-east-1e', 'us-east-1f']
  }
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const vpc = new ec2.Vpc(this, "vpc", {
      cidr: "10.0.0.0/16",
      natGateways: 0,
      maxAzs: 3,
    });
    const key = new KeyPair(this, 'KeyPair', {
      name: 'cdk-keypair',
      description: 'Key Pair created with CDK Deployment',
    });
    key.grantReadOnPublicKey
    const securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc,
      description: 'Allow SSH (TCP port 22) in',
      allowAllOutbound: true
    });
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH Access')
    const lightningSg = new ec2.SecurityGroup(this, "LightningSecurityGroup", {
      vpc,
      description: 'Allow lightning protocol (port 9735) traffic from the Internet',
      allowAllOutbound: true
    });
    lightningSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(9735));
    const setupScript = new Asset(this, "SetupScript", {
      path: path.join(__dirname, 'configure-node.sh')
    });
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
    instance.addSecurityGroup(securityGroup);
    instance.addSecurityGroup(lightningSg);
    const localPath = instance.userData.addS3DownloadCommand({
      bucket:setupScript.bucket,
      bucketKey:setupScript.s3ObjectKey,
    });
    instance.userData.addExecuteFileCommand({
      filePath:localPath,
      arguments: '--verbose -y'
    });
    setupScript.grantRead( instance.role );
    new cdk.CfnOutput(this, 'IP Address', { value: instance.instancePublicIp });
    new cdk.CfnOutput(this, 'Key Name', { value: key.keyPairName })
    new cdk.CfnOutput(this, 'Download Key Command', { value: 'aws secretsmanager get-secret-value --secret-id ec2-ssh-key/cdk-keypair/private --query SecretString --output text > cdk-key.pem && chmod 400 cdk-key.pem' })
    new cdk.CfnOutput(this, 'ssh command', { value: 'ssh -i cdk-key.pem -o IdentitiesOnly=yes ec2-user@' + instance.instancePublicIp })
  }
}
