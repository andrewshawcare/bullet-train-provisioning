#!/bin/bash
set -e

detect_stack_drift() {
  stack_name="${1:?'stack_name is required'}"
  
  if ! aws cloudformation describe-stacks --stack-name "${stack_name}"; then
    return 0
  fi
  
  stack_drift_detection_id="$(\
    aws cloudformation detect-stack-drift --stack-name "${stack_name}" | \
    jq --raw-output '.StackDriftDetectionId' \
  )"

  retries=0
  retry_limit=5
  sleep_duration_in_seconds=1
  until [ "${detection_status}" = 'DETECTION_COMPLETE' ]; do
    stack_drift_detection_status="$(\
      aws cloudformation describe-stack-drift-detection-status \
        --stack-drift-detection-id "${stack_drift_detection_id}" \
    )"
    detection_status="$(echo "${stack_drift_detection_status}" | jq --raw-output '.DetectionStatus')"
    
    echo "Detection status for ${stack_name}: ${detection_status}"
    
    if [ "${detection_status}" = 'DETECTION_FAILED' ]; then
      echo "Drift detection for stack ${stack_name} failed:"
      echo "${stack_drift_detection_status}"
      exit 1
    elif [ $retries -ge $retry_limit ]; then
      echo "Retry limit of ${retry_limit} attempts exceeded."
      exit 1
    else
      sleep ${sleep_duration_in_seconds}
      sleep_duration_in_seconds=$((${sleep_duration_in_seconds} * 2))
    fi
    
    retries=$((retries + 1))
  done
  
  stack_drift_status="$(echo "${stack_drift_detection_status}" | jq --raw-output '.StackDriftStatus')"
  if [ "${stack_drift_status}" != 'IN_SYNC' ]; then
    echo "${stack_drift_detection_status}"
    exit 1
  fi
}