import unittest
import xml.etree.ElementTree as ET
from android_auth_entry import bounds_center, find_node


class AccessibleTargets(unittest.TestCase):
    def test_center_comes_from_current_node_bounds(self):
        self.assertEqual(bounds_center('[10,20][110,80]'), (60,50))

    def test_rejects_missing_or_invisible_bounds(self):
        for bounds in ('', '[0,0][0,0]', '[40,0][20,80]'):
            with self.subTest(bounds=bounds), self.assertRaises(ValueError):
                bounds_center(bounds)

    def test_uses_accessible_name_and_clickable_ancestor(self):
        tree = ET.fromstring('<hierarchy><node clickable="true" bounds="[0,0][80,80]"><node content-desc="Close" bounds="[10,10][40,40]" /></node></hierarchy>')
        node = find_node(tree, 'Close', clickable=True)
        self.assertEqual(node.get('bounds'), '[0,0][80,80]')
        self.assertIsNone(find_node(tree, 'Log In', clickable=True))

    def test_skips_disabled_and_offscreen_targets(self):
        tree = ET.fromstring('<hierarchy><node text="Log In" clickable="true" enabled="false" bounds="[0,0][80,80]"/><node text="Log In" clickable="true" bounds="[0,0][0,0]"/><node text="Log In" clickable="true" bounds="[50,10][100,70]"/></hierarchy>')
        self.assertEqual(find_node(tree, 'Log In', True).get('bounds'), '[50,10][100,70]')


if __name__ == '__main__':
    unittest.main()
