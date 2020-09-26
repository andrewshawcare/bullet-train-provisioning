#!/bin/bash

export AWS_PAGER=""

source ./pipeline/functions.sh

version="$(git rev-parse HEAD)"
certificate_arn=''

stack_name='BulletTrain-Service'
template_path="./cloudformation-templates/${stack_name}.yaml"
aws cloudformation validate-template --template-body "file://${template_path}"
detect_stack_drift "${stack_name}"
aws cloudformation deploy \
  --no-fail-on-empty-changeset \
  --template-file "${template_path}" \
  --stack-name "${stack_name}" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    "Version=${version}" \
    "CertificateArn=${certificate_arn}"