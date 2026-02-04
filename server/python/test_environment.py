#!/usr/bin/env python3
"""
Test script to verify Python environment and dependencies
"""
import sys
import json

def test_environment():
    result = {
        'python_version': sys.version,
        'python_executable': sys.executable,
        'imports': {}
    }
    
    # Test cv2
    try:
        import cv2
        result['imports']['cv2'] = {
            'available': True,
            'version': cv2.__version__
        }
    except ImportError as e:
        result['imports']['cv2'] = {
            'available': False,
            'error': str(e)
        }
    
    # Test numpy
    try:
        import numpy as np
        result['imports']['numpy'] = {
            'available': True,
            'version': np.__version__
        }
    except ImportError as e:
        result['imports']['numpy'] = {
            'available': False,
            'error': str(e)
        }
    
    return result

if __name__ == '__main__':
    result = test_environment()
    print(json.dumps(result, indent=2))
